-- ETH-028: household-level Stripe subscriptions.
-- Card data stays on Stripe-hosted surfaces; this schema stores only minimal
-- synchronization, entitlement, invoice, webhook, and audit metadata.

create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households(id) on delete cascade,
  stripe_customer_id text not null unique check (
    stripe_customer_id = btrim(stripe_customer_id)
    and char_length(stripe_customer_id) between 8 and 255
    and stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, stripe_customer_id)
);

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households(id) on delete cascade,
  stripe_customer_id text not null references public.billing_customers(stripe_customer_id) on delete cascade,
  stripe_subscription_id text not null unique check (
    stripe_subscription_id = btrim(stripe_subscription_id)
    and char_length(stripe_subscription_id) between 8 and 255
    and stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'
  ),
  stripe_price_id text not null check (
    stripe_price_id = btrim(stripe_price_id)
    and char_length(stripe_price_id) between 8 and 255
    and stripe_price_id ~ '^price_[A-Za-z0-9]+$'
  ),
  plan_key text not null check (plan_key = 'family_plus'),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  stripe_status text not null check (
    stripe_status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
  ),
  entitlement_status text not null check (entitlement_status in ('active', 'inactive')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  provider_updated_at timestamptz not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscription_customer_household_fk
    foreign key (household_id, stripe_customer_id)
    references public.billing_customers(household_id, stripe_customer_id)
    on delete cascade,
  constraint billing_subscription_period_check check (
    current_period_start is null
    or current_period_end is null
    or current_period_end > current_period_start
  ),
  constraint billing_subscription_entitlement_check check (
    entitlement_status = 'inactive'
    or (entitlement_status = 'active' and plan_key = 'family_plus' and stripe_status = 'active')
  )
);

create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  stripe_invoice_id text not null unique check (
    stripe_invoice_id = btrim(stripe_invoice_id)
    and char_length(stripe_invoice_id) between 8 and 255
    and stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'
  ),
  stripe_subscription_id text references public.billing_subscriptions(stripe_subscription_id) on delete set null,
  amount_due bigint not null check (amount_due >= 0),
  amount_paid bigint not null check (amount_paid >= 0),
  currency text not null check (currency = 'usd'),
  status text not null check (status in ('draft','open','paid','uncollectible','void')),
  invoice_number text check (
    invoice_number is null
    or (invoice_number = btrim(invoice_number) and char_length(invoice_number) between 1 and 80)
  ),
  hosted_invoice_url text check (
    hosted_invoice_url is null
    or (char_length(hosted_invoice_url) <= 2048 and hosted_invoice_url ~ '^https://')
  ),
  -- Deliberately remains null until a separate privacy review approves storing PDF URLs.
  invoice_pdf_url text check (
    invoice_pdf_url is null
    or (char_length(invoice_pdf_url) <= 2048 and invoice_pdf_url ~ '^https://')
  ),
  period_start timestamptz,
  period_end timestamptz,
  provider_created_at timestamptz not null,
  provider_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoice_period_check check (
    period_start is null or period_end is null or period_end >= period_start
  )
);

create table public.stripe_webhook_events (
  stripe_event_id text primary key check (
    stripe_event_id = btrim(stripe_event_id)
    and char_length(stripe_event_id) between 8 and 255
    and stripe_event_id ~ '^evt_[A-Za-z0-9]+$'
  ),
  event_type text not null check (
    event_type in (
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed'
    )
  ),
  api_version text check (api_version is null or char_length(api_version) <= 80),
  provider_created_at timestamptz not null,
  processing_status text not null check (processing_status in ('received','processing','processed','failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  last_error_code text check (
    last_error_code is null
    or (char_length(last_error_code) <= 80 and last_error_code ~ '^[a-z0-9_]+$')
  ),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_event_lifecycle_check check (
    (processing_status = 'processed' and processed_at is not null and last_error_code is null)
    or (processing_status = 'failed' and processed_at is null and last_error_code is not null)
    or (processing_status in ('received','processing') and processed_at is null)
  )
);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  -- Retain opaque actor and household identifiers without mutable foreign-key
  -- actions so the append-only audit record remains intact after lifecycle cleanup.
  household_id uuid,
  actor_user_id uuid,
  action text not null check (
    action in (
      'checkout_started','customer_linked','subscription_created','subscription_updated',
      'subscription_cancel_scheduled','subscription_ended','entitlement_granted',
      'entitlement_revoked','invoice_recorded','webhook_failed','reconciliation_completed'
    )
  ),
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata) = 'object' and octet_length(safe_metadata::text) <= 2048
  ),
  created_at timestamptz not null default now()
);

create index billing_subscriptions_household_idx on public.billing_subscriptions (household_id);
create index billing_invoices_household_created_idx
  on public.billing_invoices (household_id, provider_created_at desc);
create index stripe_webhook_events_failure_idx
  on public.stripe_webhook_events (updated_at desc)
  where processing_status = 'failed';
create index billing_events_household_created_idx
  on public.billing_events (household_id, created_at desc);

create or replace function private.billing_event_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Billing history is immutable.' using errcode = '42501';
end;
$$;

create trigger billing_events_immutable
  before update or delete on public.billing_events
  for each row execute function private.billing_event_immutable();

alter table public.billing_customers enable row level security;
alter table public.billing_customers force row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_subscriptions force row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_invoices force row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_events force row level security;
alter table public.billing_events enable row level security;
alter table public.billing_events force row level security;

create policy billing_customers_owner_or_platform_admin_read
  on public.billing_customers for select to authenticated
  using (
    private.has_household_permission(
      household_id,
      array['owner']::public.household_permission[]
    ) or public.is_administrator()
  );

create policy billing_subscriptions_manager_or_platform_admin_read
  on public.billing_subscriptions for select to authenticated
  using (
    private.has_household_permission(
      household_id,
      array['owner','administrator']::public.household_permission[]
    ) or public.is_administrator()
  );

create policy billing_invoices_manager_or_platform_admin_read
  on public.billing_invoices for select to authenticated
  using (
    private.has_household_permission(
      household_id,
      array['owner','administrator']::public.household_permission[]
    ) or public.is_administrator()
  );

create policy stripe_webhook_events_platform_admin_read
  on public.stripe_webhook_events for select to authenticated
  using (public.is_administrator());

create policy billing_events_platform_admin_read
  on public.billing_events for select to authenticated
  using (public.is_administrator());

revoke all on public.billing_customers, public.billing_subscriptions, public.billing_invoices,
  public.stripe_webhook_events, public.billing_events from public, anon, authenticated;
-- Browser roles read only the safe security-definer projections below. Even an
-- authorized household or platform administrator cannot select provider IDs.
grant select on public.billing_customers, public.billing_subscriptions, public.billing_invoices,
  public.stripe_webhook_events, public.billing_events to service_role;

create or replace function public.get_household_billing_summary()
returns table (
  household_id uuid,
  household_name text,
  household_permission public.household_permission,
  plan_key text,
  billing_interval text,
  stripe_status text,
  entitlement_status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  cancelled_at timestamptz,
  provider_updated_at timestamptz,
  can_manage_billing boolean,
  can_view_invoices boolean,
  has_stripe_customer boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    household.id,
    household.name,
    membership.permission,
    case
      when subscription.stripe_status in ('canceled', 'incomplete_expired') then 'free'
      else coalesce(subscription.plan_key, 'free')
    end,
    case
      when membership.permission in ('owner'::public.household_permission, 'administrator'::public.household_permission)
        then subscription.billing_interval
    end,
    case
      when membership.permission in ('owner'::public.household_permission, 'administrator'::public.household_permission)
        then subscription.stripe_status
    end,
    coalesce(subscription.entitlement_status, 'inactive'),
    case
      when membership.permission in ('owner'::public.household_permission, 'administrator'::public.household_permission)
        then subscription.current_period_start
    end,
    case
      when membership.permission in ('owner'::public.household_permission, 'administrator'::public.household_permission)
        then subscription.current_period_end
    end,
    case
      when membership.permission in ('owner'::public.household_permission, 'administrator'::public.household_permission)
        then coalesce(subscription.cancel_at_period_end, false)
    end,
    case
      when membership.permission in ('owner'::public.household_permission, 'administrator'::public.household_permission)
        then subscription.cancelled_at
    end,
    case
      when membership.permission in ('owner'::public.household_permission, 'administrator'::public.household_permission)
        then subscription.provider_updated_at
    end,
    membership.permission = 'owner'::public.household_permission,
    membership.permission in ('owner'::public.household_permission, 'administrator'::public.household_permission),
    customer.id is not null and membership.permission = 'owner'::public.household_permission
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  left join public.billing_customers as customer on customer.household_id = household.id
  left join public.billing_subscriptions as subscription on subscription.household_id = household.id
  where membership.user_id = auth.uid()
    and membership.status = 'active'::public.membership_status
    and household.deleted_at is null
  order by household.created_at
  limit 1;
$$;

create or replace function public.list_household_billing_invoices()
returns table (
  invoice_id uuid,
  amount_due bigint,
  amount_paid bigint,
  currency text,
  status text,
  invoice_number text,
  hosted_invoice_url text,
  period_start timestamptz,
  period_end timestamptz,
  provider_created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select invoice.id, invoice.amount_due, invoice.amount_paid, invoice.currency,
    invoice.status, invoice.invoice_number, invoice.hosted_invoice_url,
    invoice.period_start, invoice.period_end, invoice.provider_created_at
  from public.billing_invoices as invoice
  where private.has_household_permission(
    invoice.household_id,
    array['owner','administrator']::public.household_permission[]
  )
  order by invoice.provider_created_at desc
  limit 100;
$$;

create or replace function public.list_admin_billing_invoices(target_household_id uuid default null)
returns table (
  household_id uuid,
  household_name text,
  invoice_id uuid,
  amount_due bigint,
  amount_paid bigint,
  currency text,
  status text,
  invoice_number text,
  hosted_invoice_url text,
  period_start timestamptz,
  period_end timestamptz,
  provider_created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select household.id, household.name, invoice.id, invoice.amount_due,
    invoice.amount_paid, invoice.currency, invoice.status, invoice.invoice_number,
    invoice.hosted_invoice_url, invoice.period_start, invoice.period_end,
    invoice.provider_created_at
  from public.billing_invoices as invoice
  join public.households as household on household.id = invoice.household_id
  where public.is_administrator()
    and household.deleted_at is null
    and (target_household_id is null or household.id = target_household_id)
  order by invoice.provider_created_at desc
  limit 500;
$$;

create or replace function public.list_admin_billing_summaries()
returns table (
  household_id uuid,
  household_name text,
  plan_key text,
  billing_interval text,
  stripe_status text,
  entitlement_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  provider_updated_at timestamptz,
  invoice_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select household.id, household.name,
    case
      when subscription.stripe_status in ('canceled', 'incomplete_expired') then 'free'
      else coalesce(subscription.plan_key, 'free')
    end,
    subscription.billing_interval, subscription.stripe_status,
    coalesce(subscription.entitlement_status, 'inactive'), subscription.current_period_end,
    coalesce(subscription.cancel_at_period_end, false), subscription.provider_updated_at,
    count(invoice.id)
  from public.households as household
  left join public.billing_subscriptions as subscription on subscription.household_id = household.id
  left join public.billing_invoices as invoice on invoice.household_id = household.id
  where public.is_administrator() and household.deleted_at is null
  group by household.id, household.name, subscription.plan_key, subscription.billing_interval,
    subscription.stripe_status, subscription.entitlement_status, subscription.current_period_end,
    subscription.cancel_at_period_end, subscription.provider_updated_at
  order by household.created_at desc;
$$;

create or replace function public.list_failed_stripe_webhook_events()
returns table (
  stripe_event_id text,
  event_type text,
  attempt_count integer,
  last_error_code text,
  provider_created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select event.stripe_event_id, event.event_type, event.attempt_count,
    event.last_error_code, event.provider_created_at, event.updated_at
  from public.stripe_webhook_events as event
  where public.is_administrator() and event.processing_status = 'failed'
  order by event.updated_at desc
  limit 100;
$$;

create or replace function public.has_household_entitlement(input_entitlement text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select input_entitlement = 'family_plus'
    and exists (
      select 1
      from public.household_members as membership
      join public.billing_subscriptions as subscription
        on subscription.household_id = membership.household_id
      where membership.user_id = auth.uid()
        and membership.status = 'active'::public.membership_status
        and subscription.plan_key = 'family_plus'
        and subscription.stripe_status = 'active'
        and subscription.entitlement_status = 'active'
        and (subscription.current_period_end is null or subscription.current_period_end > now())
    );
$$;

create or replace function public.link_household_billing_customer(
  target_household_id uuid,
  target_actor_id uuid,
  input_stripe_customer_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare existing_customer public.billing_customers%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Billing operation is unavailable.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = target_actor_id
      and status = 'active'::public.membership_status
      and permission = 'owner'::public.household_permission
  ) then
    raise exception 'Billing operation is unavailable.' using errcode = '42501';
  end if;
  select * into existing_customer from public.billing_customers where household_id = target_household_id for update;
  if existing_customer.id is not null then
    if existing_customer.stripe_customer_id <> input_stripe_customer_id then
      raise exception 'Billing customer conflict.' using errcode = '40001';
    end if;
    return;
  end if;
  insert into public.billing_customers (household_id, stripe_customer_id)
  values (target_household_id, input_stripe_customer_id);
  insert into public.billing_events (household_id, actor_user_id, action)
  values (target_household_id, target_actor_id, 'customer_linked');
end;
$$;

create or replace function public.record_billing_checkout_started(
  target_household_id uuid,
  target_actor_id uuid,
  input_billing_interval text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role'
    or input_billing_interval not in ('month','year')
    or not exists (
      select 1 from public.household_members
      where household_id = target_household_id and user_id = target_actor_id
        and status = 'active'::public.membership_status
        and permission = 'owner'::public.household_permission
    ) then
    raise exception 'Billing operation is unavailable.' using errcode = '42501';
  end if;
  insert into public.billing_events (household_id, actor_user_id, action, safe_metadata)
  values (
    target_household_id,
    target_actor_id,
    'checkout_started',
    jsonb_build_object('plan_key', 'family_plus', 'billing_interval', input_billing_interval)
  );
end;
$$;

create or replace function public.begin_stripe_webhook_event(
  input_stripe_event_id text,
  input_event_type text,
  input_api_version text,
  input_provider_created_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare existing_event public.stripe_webhook_events%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Webhook operation is unavailable.' using errcode = '42501';
  end if;
  select * into existing_event from public.stripe_webhook_events
    where stripe_event_id = input_stripe_event_id for update;
  if existing_event.stripe_event_id is null then
    insert into public.stripe_webhook_events (
      stripe_event_id, event_type, api_version, provider_created_at,
      processing_status, attempt_count
    ) values (
      input_stripe_event_id, input_event_type, input_api_version,
      input_provider_created_at, 'processing', 1
    );
    return 'process';
  end if;
  if existing_event.event_type <> input_event_type then
    raise exception 'Webhook event conflict.' using errcode = '22023';
  end if;
  if existing_event.processing_status = 'processed' then return 'duplicate'; end if;
  if existing_event.processing_status = 'processing' then return 'busy'; end if;
  update public.stripe_webhook_events
    set processing_status = 'processing',
        attempt_count = least(attempt_count + 1, 10),
        last_error_code = null,
        updated_at = now()
    where stripe_event_id = input_stripe_event_id;
  return 'process';
end;
$$;

create or replace function public.complete_stripe_webhook_event(input_stripe_event_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Webhook operation is unavailable.' using errcode = '42501';
  end if;
  update public.stripe_webhook_events
    set processing_status = 'processed', processed_at = now(), last_error_code = null, updated_at = now()
    where stripe_event_id = input_stripe_event_id and processing_status = 'processing';
  if not found then raise exception 'Webhook event is unavailable.' using errcode = '40001'; end if;
end;
$$;

create or replace function public.fail_stripe_webhook_event(
  input_stripe_event_id text,
  input_error_code text,
  target_household_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role'
    or input_error_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'Webhook operation is unavailable.' using errcode = '42501';
  end if;
  update public.stripe_webhook_events
    set processing_status = 'failed', processed_at = null,
        last_error_code = input_error_code, updated_at = now()
    where stripe_event_id = input_stripe_event_id and processing_status = 'processing';
  if found then
    insert into public.billing_events (household_id, action, safe_metadata)
    values (target_household_id, 'webhook_failed', jsonb_build_object('error_code', input_error_code));
  end if;
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
  if existing_subscription.id is null then
    insert into public.billing_subscriptions (
      household_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
      plan_key, billing_interval, stripe_status, entitlement_status,
      current_period_start, current_period_end, cancel_at_period_end,
      cancelled_at, provider_updated_at
    ) values (
      target_household_id, input_stripe_customer_id, input_stripe_subscription_id,
      input_stripe_price_id, 'family_plus', input_billing_interval,
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
      'plan_key', 'family_plus', 'billing_interval', input_billing_interval,
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
  elsif next_entitlement = 'inactive'
    and existing_subscription.id is not null
    and existing_subscription.entitlement_status = 'active' then
    insert into public.billing_events (household_id, action)
    values (target_household_id, 'entitlement_revoked');
  end if;
  return true;
end;
$$;

create or replace function public.sync_billing_invoice(
  target_household_id uuid,
  input_stripe_invoice_id text,
  input_stripe_subscription_id text,
  input_amount_due bigint,
  input_amount_paid bigint,
  input_currency text,
  input_status text,
  input_period_start timestamptz,
  input_period_end timestamptz,
  input_provider_created_at timestamptz,
  input_provider_updated_at timestamptz,
  input_invoice_number text default null,
  input_hosted_invoice_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare existing_invoice public.billing_invoices%rowtype;
begin
  if auth.role() <> 'service_role'
    or input_currency <> 'usd'
    or input_status not in ('draft','open','paid','uncollectible','void')
    or input_amount_due < 0 or input_amount_paid < 0 then
    raise exception 'Invoice synchronization is unavailable.' using errcode = '42501';
  end if;
  select * into existing_invoice from public.billing_invoices
    where stripe_invoice_id = input_stripe_invoice_id for update;
  if existing_invoice.id is not null
    and existing_invoice.provider_updated_at >= input_provider_updated_at then
    return false;
  end if;
  insert into public.billing_invoices (
    household_id, stripe_invoice_id, stripe_subscription_id, amount_due,
    amount_paid, currency, status, invoice_number, hosted_invoice_url,
    invoice_pdf_url, period_start, period_end, provider_created_at,
    provider_updated_at
  ) values (
    target_household_id, input_stripe_invoice_id, input_stripe_subscription_id,
    input_amount_due, input_amount_paid, input_currency, input_status,
    nullif(btrim(input_invoice_number), ''), input_hosted_invoice_url, null,
    input_period_start, input_period_end, input_provider_created_at,
    input_provider_updated_at
  )
  on conflict (stripe_invoice_id) do update set
    stripe_subscription_id = excluded.stripe_subscription_id,
    amount_due = excluded.amount_due,
    amount_paid = excluded.amount_paid,
    status = excluded.status,
    invoice_number = excluded.invoice_number,
    hosted_invoice_url = excluded.hosted_invoice_url,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    provider_created_at = excluded.provider_created_at,
    provider_updated_at = excluded.provider_updated_at,
    updated_at = now()
  where public.billing_invoices.provider_updated_at < excluded.provider_updated_at;
  if not found then return false; end if;
  insert into public.billing_events (household_id, action, safe_metadata)
  values (target_household_id, 'invoice_recorded', jsonb_build_object('status', input_status));
  return true;
end;
$$;

create or replace function public.record_billing_reconciliation(
  target_household_id uuid,
  target_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' or not exists (
    select 1 from public.user_roles
    where user_id = target_actor_id and role = 'administrator'::public.app_role
  ) then
    raise exception 'Reconciliation is unavailable.' using errcode = '42501';
  end if;
  insert into public.billing_events (household_id, actor_user_id, action)
  values (target_household_id, target_actor_id, 'reconciliation_completed');
end;
$$;

revoke all on function private.billing_event_immutable() from public, anon, authenticated;
revoke all on function public.get_household_billing_summary() from public, anon;
revoke all on function public.list_household_billing_invoices() from public, anon;
revoke all on function public.list_admin_billing_invoices(uuid) from public, anon;
revoke all on function public.list_admin_billing_summaries() from public, anon;
revoke all on function public.list_failed_stripe_webhook_events() from public, anon;
revoke all on function public.has_household_entitlement(text) from public, anon;
grant execute on function public.get_household_billing_summary() to authenticated;
grant execute on function public.list_household_billing_invoices() to authenticated;
grant execute on function public.list_admin_billing_invoices(uuid) to authenticated;
grant execute on function public.list_admin_billing_summaries() to authenticated;
grant execute on function public.list_failed_stripe_webhook_events() to authenticated;
grant execute on function public.has_household_entitlement(text) to authenticated;

revoke all on function public.link_household_billing_customer(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.record_billing_checkout_started(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.begin_stripe_webhook_event(text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(text) from public, anon, authenticated;
revoke all on function public.fail_stripe_webhook_event(text,text,uuid) from public, anon, authenticated;
revoke all on function public.sync_billing_subscription(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.sync_billing_invoice(uuid,text,text,bigint,bigint,text,text,timestamptz,timestamptz,timestamptz,timestamptz,text,text) from public, anon, authenticated;
revoke all on function public.record_billing_reconciliation(uuid,uuid) from public, anon, authenticated;

grant execute on function public.link_household_billing_customer(uuid,uuid,text) to service_role;
grant execute on function public.record_billing_checkout_started(uuid,uuid,text) to service_role;
grant execute on function public.begin_stripe_webhook_event(text,text,text,timestamptz) to service_role;
grant execute on function public.complete_stripe_webhook_event(text) to service_role;
grant execute on function public.fail_stripe_webhook_event(text,text,uuid) to service_role;
grant execute on function public.sync_billing_subscription(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz) to service_role;
grant execute on function public.sync_billing_invoice(uuid,text,text,bigint,bigint,text,text,timestamptz,timestamptz,timestamptz,timestamptz,text,text) to service_role;
grant execute on function public.record_billing_reconciliation(uuid,uuid) to service_role;
