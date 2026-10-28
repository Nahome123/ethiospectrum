-- RBT Boot Camp becomes a one-time course purchase ($99, from the configured
-- Stripe Price) with 365 days of access, replacing the monthly subscription.
--
-- * training_access records each purchase per household. A renewal bought
--   before the current access ends starts when it ends, so no days are lost.
-- * Training access = an unexpired, unrefunded course purchase, OR (for
--   existing monthly subscribers, grandfathered) an active subscription. No
--   subscription is cancelled here; new subscriptions are simply no longer sold.
-- * The webhook grants access on a paid course Checkout and revokes it when
--   the charge is fully refunded. Both are idempotent and safe out of order:
--   a refund that arrives first is remembered and blocks a later grant.

-- 1. Purchases -------------------------------------------------------------------------

create table public.training_access (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  status text not null check (status in ('active', 'refunded')),
  purchased_at timestamptz,
  starts_at timestamptz,
  expires_at timestamptz,
  stripe_checkout_session_id text unique check (stripe_checkout_session_id is null or stripe_checkout_session_id ~ '^cs_[A-Za-z0-9_]+$'),
  stripe_payment_intent_id text unique check (stripe_payment_intent_id is null or stripe_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  amount_cents integer check (amount_cents is null or amount_cents between 0 and 1000000),
  currency text check (currency is null or currency ~ '^[a-z]{3}$'),
  purchased_by uuid references auth.users(id) on delete set null,
  provider_updated_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_access_active_shape check (
    status <> 'active' or (purchased_at is not null and starts_at is not null and expires_at > starts_at)
  ),
  constraint training_access_provider_reference check (
    stripe_checkout_session_id is not null or stripe_payment_intent_id is not null
  )
);
create index training_access_household_idx on public.training_access (household_id, expires_at desc);

alter table public.training_access enable row level security;
alter table public.training_access force row level security;
create policy training_access_read on public.training_access
  for select to authenticated
  using (
    public.is_administrator()
    or exists (
      select 1 from public.household_members as membership
      where membership.household_id = training_access.household_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  );
grant select on public.training_access to authenticated;

-- When a household's course access ends (null when it has none).
create function private.course_access_until(target_household uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(expires_at) from public.training_access
  where household_id = target_household and status = 'active' and expires_at > now();
$$;

-- 2. Who may train ----------------------------------------------------------------------

create or replace function private.has_training_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_current_user_administrator() or exists (
    select 1
    from public.household_members as membership
    join public.households as household on household.id = membership.household_id
    where membership.user_id = auth.uid()
      and membership.status = 'active'
      and household.deleted_at is null
      and (
        membership.permission = 'owner'::public.household_permission
        or (membership.permission = 'member'::public.household_permission and 'access_training' = any(membership.caregiver_permissions))
      )
      and (
        private.course_access_until(household.id) is not null
        or exists (
          -- Grandfathered monthly subscribers keep access while subscribed.
          select 1 from public.billing_subscriptions as subscription
          where subscription.household_id = household.id
            and subscription.plan_key = 'rbt_bootcamp'
            and subscription.stripe_status = 'active'
            and subscription.entitlement_status = 'active'
            and (subscription.current_period_end is null or subscription.current_period_end > now())
        )
      )
  );
$$;

create or replace function public.has_household_entitlement(input_entitlement text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select input_entitlement = 'rbt_bootcamp'
    and exists (
      select 1
      from public.household_members as membership
      where membership.user_id = auth.uid()
        and membership.status = 'active'::public.membership_status
        and (
          private.course_access_until(membership.household_id) is not null
          or exists (
            select 1 from public.billing_subscriptions as subscription
            where subscription.household_id = membership.household_id
              and subscription.plan_key = 'rbt_bootcamp'
              and subscription.stripe_status = 'active'
              and subscription.entitlement_status = 'active'
              and (subscription.current_period_end is null or subscription.current_period_end > now())
          )
        )
    );
$$;

-- What the billing page, training page and dashboard show.
create function public.get_training_course_status()
returns table (
  household_id uuid,
  access_expires_at timestamptz,
  legacy_subscription_active boolean,
  legacy_period_end timestamptz,
  legacy_cancel_at_period_end boolean,
  can_purchase boolean,
  renewable boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with household as (
    select private.current_household_id() as id
  ),
  legacy as (
    select subscription.current_period_end, subscription.cancel_at_period_end
    from public.billing_subscriptions as subscription, household
    where subscription.household_id = household.id
      and subscription.plan_key = 'rbt_bootcamp'
      and subscription.stripe_status = 'active'
      and subscription.entitlement_status = 'active'
      and (subscription.current_period_end is null or subscription.current_period_end > now())
  )
  select household.id,
    private.course_access_until(household.id),
    exists (select 1 from legacy),
    (select current_period_end from legacy limit 1),
    coalesce((select cancel_at_period_end from legacy limit 1), false),
    coalesce(private.household_actor_can(household.id, 'manage_subscription'), false),
    coalesce(private.household_actor_can(household.id, 'manage_subscription'), false)
      and (private.course_access_until(household.id) is null
        or private.course_access_until(household.id) <= now() + interval '30 days')
  from household
  where household.id is not null;
$$;

-- 3. Webhook synchronization (service role only) -------------------------------------------

create function public.grant_training_access(
  target_household_id uuid,
  input_session_id text,
  input_payment_intent_id text,
  input_amount_cents integer,
  input_currency text,
  input_paid_at timestamptz,
  input_purchased_by uuid,
  input_provider_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.training_access%rowtype;
  starts timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Training access synchronization is unavailable.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.households where id = target_household_id and deleted_at is null) then
    raise exception 'Household is unavailable.' using errcode = '22023';
  end if;
  -- Serialize purchases for one household so renewals stack correctly.
  perform pg_advisory_xact_lock(hashtextextended('training_access:' || target_household_id::text, 0));
  select * into existing from public.training_access
  where stripe_checkout_session_id = input_session_id
     or (input_payment_intent_id is not null and stripe_payment_intent_id = input_payment_intent_id)
  limit 1;
  if existing.id is not null then
    -- Already granted, or refunded before this event arrived: never re-grant.
    if existing.status = 'refunded' and existing.stripe_checkout_session_id is null then
      update public.training_access
      set stripe_checkout_session_id = input_session_id, household_id = target_household_id, updated_at = now()
      where id = existing.id;
    end if;
    return false;
  end if;

  starts := greatest(coalesce(input_paid_at, now()), coalesce(private.course_access_until(target_household_id), '-infinity'::timestamptz));
  insert into public.training_access (
    household_id, status, purchased_at, starts_at, expires_at, stripe_checkout_session_id,
    stripe_payment_intent_id, amount_cents, currency, purchased_by, provider_updated_at
  ) values (
    target_household_id, 'active', coalesce(input_paid_at, now()), starts, starts + interval '365 days',
    input_session_id, input_payment_intent_id, input_amount_cents, lower(input_currency), input_purchased_by,
    input_provider_updated_at
  );
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (input_purchased_by, 'training_course_purchased', 'household', target_household_id,
    jsonb_build_object('expires_at', starts + interval '365 days', 'amount_cents', input_amount_cents));
  return true;
end;
$$;

create function public.revoke_training_access(
  input_payment_intent_id text,
  input_provider_updated_at timestamptz,
  target_household_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare existing public.training_access%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Training access synchronization is unavailable.' using errcode = '42501';
  end if;
  select * into existing from public.training_access where stripe_payment_intent_id = input_payment_intent_id for update;
  if existing.id is null then
    -- Refund seen before the purchase: remember it so the late grant is refused.
    -- (The caller passes the household only for course payments.)
    if target_household_id is null then
      return null;
    end if;
    insert into public.training_access (household_id, status, stripe_payment_intent_id, provider_updated_at, refunded_at)
    values (target_household_id, 'refunded', input_payment_intent_id, input_provider_updated_at, now())
    on conflict (stripe_payment_intent_id) do nothing;
    return target_household_id;
  end if;
  if existing.status = 'refunded' then
    return existing.household_id;
  end if;
  update public.training_access
  set status = 'refunded', refunded_at = now(), provider_updated_at = input_provider_updated_at, updated_at = now()
  where id = existing.id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (null, 'training_course_refunded', 'household', existing.household_id,
    jsonb_build_object('payment_intent', input_payment_intent_id));
  return existing.household_id;
end;
$$;

-- 4. Administration ----------------------------------------------------------------------

create function public.admin_list_training_access()
returns table (
  household_id uuid,
  household_name text,
  status text,
  purchased_at timestamptz,
  expires_at timestamptz,
  amount_cents integer,
  refunded_at timestamptz,
  is_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select access.household_id, household.name, access.status, access.purchased_at, access.expires_at,
    access.amount_cents, access.refunded_at,
    access.status = 'active' and access.expires_at > now()
  from public.training_access as access
  join public.households as household on household.id = access.household_id
  where public.is_administrator()
  order by coalesce(access.purchased_at, access.created_at) desc
  limit 500;
$$;

-- 5. Catalog and webhook events -------------------------------------------------------------

alter table public.services drop constraint if exists services_payment_type_check;
alter table public.services add constraint services_payment_type_check
  check (payment_type in ('recurring_monthly', 'one_time'));
alter table public.services drop constraint if exists services_payment_shape;
alter table public.services add constraint services_payment_shape check (
  (service_type = 'rbt_bootcamp' and duration_minutes is null)
  or (service_type <> 'rbt_bootcamp' and payment_type = 'one_time' and price_cents is not null and duration_minutes is not null)
);
update public.services
set payment_type = 'one_time',
    description = 'A self-paced course that helps parents understand neurodivergency, complete the Ethiospectrum curriculum, and prepare for an external RBT-related credential or exam. One payment gives a year of access. Completing the course is not an RBT certification.',
    version = version + 1, updated_at = now()
where service_type = 'rbt_bootcamp';

alter table public.stripe_webhook_events drop constraint if exists stripe_webhook_events_event_type_check;
alter table public.stripe_webhook_events add constraint stripe_webhook_events_event_type_check check (
  event_type in (
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_failed',
    'payment_intent.payment_failed',
    'refund.updated',
    'charge.refunded'
  )
);

-- 6. Grants ---------------------------------------------------------------------------------

revoke all on function private.course_access_until(uuid) from public, anon, authenticated;
revoke all on function public.get_training_course_status() from public, anon;
grant execute on function public.get_training_course_status() to authenticated;
revoke all on function public.grant_training_access(uuid, text, text, integer, text, timestamptz, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_training_access(uuid, text, text, integer, text, timestamptz, uuid, timestamptz) to service_role;
revoke all on function public.revoke_training_access(text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.revoke_training_access(text, timestamptz, uuid) to service_role;
revoke all on function public.admin_list_training_access() from public, anon;
grant execute on function public.admin_list_training_access() to authenticated;
