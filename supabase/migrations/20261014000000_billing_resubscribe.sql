-- Re-subscribing after a cancellation creates a new Stripe subscription on the
-- same customer. Two things broke that:
--   1. billing_invoices.stripe_subscription_id referenced the household's
--      single billing_subscriptions row, so replacing the subscription id (or
--      recording an invoice of the earlier subscription) violated the foreign
--      key. Invoices keep the Stripe subscription id as a plain reference.
--   2. Replaying an earlier, ended subscription (a late webhook or a
--      reconciliation) could overwrite the live one. Such updates are ignored.

do $$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_catalog.pg_constraint as c
    where c.conrelid = 'public.billing_invoices'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.billing_subscriptions'::regclass
  loop
    execute format('alter table public.billing_invoices drop constraint %I', constraint_name);
  end loop;
end;
$$;

create or replace function public.sync_billing_subscription(
  target_household_id uuid,
  input_stripe_customer_id text,
  input_stripe_subscription_id text,
  input_stripe_price_id text,
  input_billing_interval text,
  input_stripe_status text,
  input_current_period_start timestamptz,
  input_current_period_end timestamptz,
  input_cancel_at_period_end boolean,
  input_provider_updated_at timestamptz,
  input_cancelled_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare existing_subscription public.billing_subscriptions%rowtype;
declare next_entitlement text;
declare lifecycle_action text;
begin
  if auth.role() <> 'service_role'
    or input_billing_interval not in ('month','year')
    or input_stripe_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
    or not exists (
      select 1 from public.billing_customers
      where household_id = target_household_id and stripe_customer_id = input_stripe_customer_id
    ) then
    raise exception 'Subscription synchronization is unavailable.' using errcode = '42501';
  end if;
  next_entitlement := case when input_stripe_status = 'active' then 'active' else 'inactive' end;
  select * into existing_subscription from public.billing_subscriptions
    where household_id = target_household_id for update;
  if existing_subscription.id is not null
    and existing_subscription.provider_updated_at >= input_provider_updated_at then
    return false;
  end if;
  -- A household has one current subscription. After a member cancels and
  -- subscribes again, Stripe has two: never let the old, ended one replace
  -- the live one (late webhooks and reconciliation both replay old ones).
  if existing_subscription.id is not null
    and existing_subscription.stripe_subscription_id <> input_stripe_subscription_id
    and input_stripe_status in ('canceled', 'incomplete_expired')
    and existing_subscription.stripe_status not in ('canceled', 'incomplete_expired') then
    return false;
  end if;
  if existing_subscription.id is null then
    insert into public.billing_subscriptions (
      household_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
      plan_key, billing_interval, stripe_status, entitlement_status,
      current_period_start, current_period_end, cancel_at_period_end,
      cancelled_at, provider_updated_at
    ) values (
      target_household_id, input_stripe_customer_id, input_stripe_subscription_id,
      input_stripe_price_id, 'rbt_bootcamp', input_billing_interval,
      input_stripe_status, next_entitlement, input_current_period_start,
      input_current_period_end, input_cancel_at_period_end, input_cancelled_at,
      input_provider_updated_at
    );
    lifecycle_action := 'subscription_created';
  else
    update public.billing_subscriptions set
      stripe_customer_id = input_stripe_customer_id,
      stripe_subscription_id = input_stripe_subscription_id,
      stripe_price_id = input_stripe_price_id,
      billing_interval = input_billing_interval,
      stripe_status = input_stripe_status,
      entitlement_status = next_entitlement,
      current_period_start = input_current_period_start,
      current_period_end = input_current_period_end,
      cancel_at_period_end = input_cancel_at_period_end,
      cancelled_at = input_cancelled_at,
      provider_updated_at = input_provider_updated_at,
      version = version + 1,
      updated_at = now()
    where id = existing_subscription.id;
    lifecycle_action := case when input_stripe_status = 'canceled'
      then 'subscription_ended' else 'subscription_updated' end;
  end if;
  insert into public.billing_events (household_id, action, safe_metadata)
  values (
    target_household_id,
    lifecycle_action,
    jsonb_build_object(
      'plan_key', 'rbt_bootcamp', 'billing_interval', input_billing_interval,
      'stripe_status', input_stripe_status
    )
  );
  if input_cancel_at_period_end
    and (existing_subscription.id is null or not existing_subscription.cancel_at_period_end) then
    insert into public.billing_events (household_id, action)
    values (target_household_id, 'subscription_cancel_scheduled');
  end if;
  if next_entitlement = 'active'
    and (existing_subscription.id is null or existing_subscription.entitlement_status <> 'active') then
    insert into public.billing_events (household_id, action)
    values (target_household_id, 'entitlement_granted');
    perform private.notify_household(target_household_id, 'subscription_activated', null, '{}'::jsonb, '/training');
  elsif next_entitlement = 'inactive'
    and existing_subscription.id is not null
    and existing_subscription.entitlement_status = 'active' then
    insert into public.billing_events (household_id, action)
    values (target_household_id, 'entitlement_revoked');
    perform private.notify_household(target_household_id, 'subscription_inactive', null, '{}'::jsonb, '/billing');
  end if;
  return true;
end;
$$;
