-- PRD v1.0 (Phases 3-5): the common service-request architecture for
-- Consultation and IEP Language Assistance, administrator-proposed and
-- household-confirmed appointments, one-time payments, timing-based refunds,
-- messaging, per-request specialist authorization, and document linkage.
--
-- Service status, payment status, appointment status, and completion are
-- separate columns. Every mutation goes through a security-definer function
-- that derives the actor from auth.uid() (or, for provider synchronization,
-- requires the service role) and records an immutable event.
--
-- Custom SQLSTATEs used for precise UI messages:
--   ES402 payment required      ES409 schedule conflict
--   ES410 reschedule not allowed ES422 fees must be accepted

-- 1. Tables -------------------------------------------------------------------

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  dependent_id uuid not null references public.dependents(id) on delete restrict,
  service_id uuid not null references public.services(id),
  service_type text not null check (service_type in ('consultation', 'iep_language_assistance')),
  requested_by uuid not null references auth.users(id),
  specialist_id uuid references public.specialists(id) on delete set null,
  description text not null check (description = btrim(description) and char_length(description) between 10 and 3000),
  relevant_information text check (relevant_information is null or (relevant_information = btrim(relevant_information) and char_length(relevant_information) <= 3000)),
  consultation_category text check (consultation_category is null or consultation_category in ('general_guidance', 'behavioral_educational')),
  consultation_topic_key text check (consultation_topic_key is null or consultation_topic_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  preferred_language text not null check (preferred_language in ('en', 'am', 'es')),
  iep_language text check (iep_language is null or iep_language in ('am', 'es')),
  iep_services text[] not null default array[]::text[] check (
    iep_services <@ array['iep_explanation', 'meeting_language_assistance', 'written_translation']::text[]
  ),
  delivery_method text not null check (delivery_method in ('remote', 'in_person')),
  preferred_location_type text check (
    preferred_location_type is null or preferred_location_type in ('ethiospectrum_location', 'school_meeting', 'mutually_agreed')
  ),
  preferred_location_details text check (
    preferred_location_details is null or (preferred_location_details = btrim(preferred_location_details) and char_length(preferred_location_details) <= 500)
  ),
  requested_meeting_date date,
  status text not null default 'pending_review' check (status in (
    'pending_review', 'assigned', 'awaiting_availability', 'awaiting_payment',
    'appointment_proposed', 'appointment_confirmed', 'in_progress', 'completed',
    'payment_failed', 'cancelled', 'reschedule_requested', 'declined', 'no_show'
  )),
  payment_status text not null default 'unpaid' check (payment_status in (
    'unpaid', 'pending', 'processing', 'paid', 'failed', 'partially_refunded', 'refunded'
  )),
  appointment_status text not null default 'none' check (appointment_status in (
    'none', 'proposed', 'confirmed', 'completed', 'cancelled', 'no_show'
  )),
  follow_up_status text not null default 'not_available' check (follow_up_status in (
    'not_available', 'available', 'requested', 'scheduled', 'completed', 'waived'
  )),
  availability_requested_at timestamptz,
  primary_session_completed_at timestamptz,
  late_reschedule_used boolean not null default false,
  refund_cap_percent integer not null default 100 check (refund_cap_percent in (0, 50, 100)),
  full_refund_eligible boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completion_notes text check (completion_notes is null or char_length(completion_notes) <= 3000),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 1000),
  declined_reason text check (declined_reason is null or char_length(declined_reason) <= 1000),
  idempotency_key uuid not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requested_by, idempotency_key),
  constraint service_requests_shape check (
    (
      service_type = 'consultation'
      and consultation_category is not null
      and iep_language is null
      and cardinality(iep_services) = 0
      and delivery_method = 'remote'
    )
    or (
      service_type = 'iep_language_assistance'
      and iep_language is not null
      and cardinality(iep_services) between 1 and 3
      and (delivery_method = 'remote' or preferred_location_type is not null)
    )
  ),
  constraint service_requests_completion_shape check (
    (status = 'completed') = (completed_at is not null)
  )
);

create index service_requests_household_created_idx on public.service_requests (household_id, created_at desc);
create index service_requests_status_idx on public.service_requests (status, created_at);
create index service_requests_specialist_idx on public.service_requests (specialist_id, status) where specialist_id is not null;

create table public.service_appointments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  specialist_id uuid not null references public.specialists(id),
  kind text not null check (kind in ('primary', 'follow_up')),
  proposal_group uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 64),
  delivery_method text not null check (delivery_method in ('remote', 'in_person')),
  location_type text not null check (location_type in ('remote', 'ethiospectrum_location', 'school_meeting', 'mutually_agreed')),
  location_details text check (location_details is null or (location_details = btrim(location_details) and char_length(location_details) <= 500)),
  meeting_url text check (meeting_url is null or (meeting_url ~ '^https://' and char_length(meeting_url) <= 2048)),
  instructions text check (instructions is null or (instructions = btrim(instructions) and char_length(instructions) <= 1000)),
  status text not null check (status in ('proposed', 'confirmed', 'declined', 'superseded', 'cancelled', 'completed', 'no_show')),
  customer_confirmed boolean not null default false,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  scheduled_directly boolean not null default false,
  proposed_by uuid references auth.users(id) on delete set null,
  proposed_by_role text not null check (proposed_by_role in ('administrator', 'specialist')),
  cancellation_kind text check (cancellation_kind is null or cancellation_kind in (
    'customer_cancelled', 'customer_rescheduled', 'administrative', 'request_cancelled'
  )),
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 1000),
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  completion_notes text check (completion_notes is null or char_length(completion_notes) <= 3000),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_appointments_interval check (end_at > start_at),
  constraint service_appointments_location_shape check (
    (delivery_method = 'remote' and location_type = 'remote')
    or (delivery_method = 'in_person' and location_type <> 'remote')
  )
);
create index service_appointments_request_idx on public.service_appointments (service_request_id, created_at desc);
create index service_appointments_specialist_time_idx on public.service_appointments (specialist_id, start_at) where status in ('proposed', 'confirmed');
create index service_appointments_household_time_idx on public.service_appointments (household_id, start_at) where status = 'confirmed';

create table public.service_request_activities (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  activity_type text not null check (activity_type in (
    'consultation_session', 'iep_explanation', 'meeting_language_assistance', 'written_translation'
  )),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'not_needed')),
  notes text check (notes is null or char_length(notes) <= 2000),
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (service_request_id, activity_type)
);

create table public.service_request_messages (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_kind text not null check (author_kind in ('household', 'specialist', 'administrator')),
  body text not null check (body = btrim(body) and char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index service_request_messages_request_idx on public.service_request_messages (service_request_id, created_at);

create table public.service_request_events (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('household', 'specialist', 'administrator', 'system')),
  action text not null check (action ~ '^[a-z_]{3,64}$'),
  from_status text,
  to_status text,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object' and octet_length(safe_metadata::text) <= 2048),
  created_at timestamptz not null default now()
);
create index service_request_events_request_idx on public.service_request_events (service_request_id, created_at);

create table public.service_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  payer_user_id uuid not null references auth.users(id),
  base_amount_cents integer not null check (base_amount_cents >= 0),
  fee_amount_cents integer not null default 0 check (fee_amount_cents >= 0),
  accepted_fees jsonb not null default '[]'::jsonb check (jsonb_typeof(accepted_fees) = 'array' and octet_length(accepted_fees::text) <= 4096),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  tax_amount_cents integer check (tax_amount_cents is null or tax_amount_cents >= 0),
  amount_total_cents integer not null check (amount_total_cents >= 0),
  refunded_amount_cents integer not null default 0 check (refunded_amount_cents >= 0),
  currency text not null default 'usd' check (currency = 'usd'),
  payment_type text not null default 'one_time' check (payment_type = 'one_time'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed', 'partially_refunded', 'refunded')),
  provider_checkout_session_id text unique check (provider_checkout_session_id is null or provider_checkout_session_id ~ '^cs_[A-Za-z0-9_]+$'),
  provider_transaction_id text check (provider_transaction_id is null or provider_transaction_id ~ '^pi_[A-Za-z0-9_]+$'),
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  paid_at timestamptz,
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_payments_refund_bound check (refunded_amount_cents <= amount_total_cents),
  constraint service_payments_subtotal check (subtotal_cents = base_amount_cents + fee_amount_cents)
);
create index service_payments_request_idx on public.service_payments (service_request_id, created_at desc);
create index service_payments_status_idx on public.service_payments (status, created_at desc);

create table public.service_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.service_payments(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  customer_user_id uuid references auth.users(id) on delete set null,
  original_amount_cents integer not null check (original_amount_cents >= 0),
  eligible_amount_cents integer not null check (eligible_amount_cents >= 0),
  refund_amount_cents integer check (refund_amount_cents is null or refund_amount_cents > 0),
  policy_tier text not null check (policy_tier in (
    'more_than_48_hours', 'between_24_and_48_hours', 'less_than_24_hours', 'no_show',
    'no_appointment', 'administrative_cancellation', 'admin_exception', 'duplicate_payment'
  )),
  reason text not null check (reason = btrim(reason) and char_length(reason) between 2 and 1000),
  status text not null default 'requested' check (status in ('requested', 'processing', 'succeeded', 'failed', 'rejected')),
  provider_refund_id text unique check (provider_refund_id is null or provider_refund_id ~ '^(re|pyr)_[A-Za-z0-9_]+$'),
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  requested_by uuid references auth.users(id) on delete set null,
  processed_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_refunds_status_idx on public.service_refunds (status, created_at desc);
create index service_refunds_request_idx on public.service_refunds (service_request_id);

-- One settled or in-flight charge per request.
create unique index service_payments_one_settled_idx
  on public.service_payments (service_request_id)
  where status in ('processing', 'paid', 'partially_refunded', 'refunded');

-- 2. Documents may belong to one service request ---------------------------

alter table public.documents add column if not exists service_request_id uuid references public.service_requests(id) on delete set null;
create index if not exists documents_service_request_idx on public.documents (service_request_id) where service_request_id is not null and deleted_at is null;
alter table public.notifications
  add constraint notifications_service_request_fk foreign key (service_request_id) references public.service_requests(id) on delete cascade;

-- 3. Authorization helpers --------------------------------------------------

create or replace function private.is_request_household_member(target_request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.service_requests as request
    where request.id = target_request and private.is_active_household_member(request.household_id)
  );
$$;

-- Deliberately request-level: a specialist sees only requests currently assigned to them.
create or replace function private.is_request_specialist(target_request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.service_requests as request
    join public.specialists as specialist on specialist.id = request.specialist_id
    join public.user_roles as role_row on role_row.user_id = specialist.user_id
    where request.id = target_request
      and specialist.user_id = auth.uid()
      and role_row.role = 'specialist'::public.app_role
      and request.status not in ('declined')
  );
$$;

create or replace function private.can_read_service_request(target_request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_request_household_member(target_request)
    or private.is_request_specialist(target_request)
    or private.is_current_user_administrator();
$$;

create or replace function private.display_name(target_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Ethiospectrum user')
  from public.profiles as profile where profile.id = target_user
  union all select 'Ethiospectrum user'
  limit 1;
$$;

create or replace function private.specialist_display_name(target_specialist uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Ethiospectrum specialist')
  from public.specialists as specialist
  left join public.profiles as profile on profile.id = specialist.user_id
  where specialist.id = target_specialist;
$$;

create or replace function private.specialist_user_id(target_specialist uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.specialists where id = target_specialist;
$$;

-- 4. Event, status, and notification helpers -------------------------------

create or replace function private.request_actor_kind(target_request uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'system'
    when private.is_current_user_administrator() then 'administrator'
    when private.is_request_specialist(target_request) then 'specialist'
    else 'household'
  end;
$$;

create or replace function private.record_request_event(
  target_request uuid,
  input_action text,
  input_from_status text,
  input_to_status text,
  input_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.service_request_events (
    service_request_id, actor_id, actor_kind, action, from_status, to_status, safe_metadata
  ) values (
    target_request, auth.uid(), private.request_actor_kind(target_request), input_action,
    input_from_status, input_to_status, coalesce(input_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function private.set_request_status(
  target_request uuid,
  next_status text,
  input_action text,
  input_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare previous_status text;
begin
  select status into previous_status from public.service_requests where id = target_request;
  update public.service_requests
  set status = next_status, version = version + 1, updated_at = now()
  where id = target_request;
  perform private.record_request_event(target_request, input_action, previous_status, next_status, input_metadata);
end;
$$;

create or replace function private.touch_request(target_request uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.service_requests set version = version + 1, updated_at = now() where id = target_request;
$$;

create or replace function private.sync_request_appointment_status(target_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare next_status text;
begin
  -- Live appointments win; otherwise the most recent terminal outcome.
  select case
    when bool_or(status = 'confirmed') then 'confirmed'
    when bool_or(status = 'proposed') then 'proposed'
    else coalesce(
      (array_agg(status order by coalesce(completed_at, cancelled_at, updated_at) desc)
        filter (where status in ('completed', 'no_show', 'cancelled')))[1],
      'none'
    )
  end into next_status
  from public.service_appointments
  where service_request_id = target_request;
  update public.service_requests
  set appointment_status = coalesce(next_status, 'none')
  where id = target_request;
end;
$$;

create or replace function private.request_link(target_request uuid, audience text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case audience
    when 'administrator' then '/admin/service-requests/' || target_request::text
    when 'specialist' then '/specialist/requests/' || target_request::text
    else '/requests/' || target_request::text
  end;
$$;

create or replace function private.notify_request_household(target_request uuid, input_type text, input_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  select * into request from public.service_requests where id = target_request;
  perform private.notify_household(
    request.household_id, input_type, request.id,
    jsonb_build_object('service_type', request.service_type) || coalesce(input_payload, '{}'::jsonb),
    private.request_link(request.id, 'household')
  );
end;
$$;

create or replace function private.notify_request_specialist(target_request uuid, input_type text, input_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  select * into request from public.service_requests where id = target_request;
  if request.specialist_id is null then return; end if;
  perform private.notify(
    private.specialist_user_id(request.specialist_id), input_type, null, request.id,
    jsonb_build_object('service_type', request.service_type) || coalesce(input_payload, '{}'::jsonb),
    private.request_link(request.id, 'specialist')
  );
end;
$$;

create or replace function private.notify_request_administrators(target_request uuid, input_type text, input_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  select * into request from public.service_requests where id = target_request;
  perform private.notify_administrators(
    input_type, null, request.id,
    jsonb_build_object('service_type', request.service_type) || coalesce(input_payload, '{}'::jsonb),
    private.request_link(request.id, 'administrator')
  );
end;
$$;

-- 5. Refund policy (PRD section 26) -----------------------------------------

create or replace function public.service_refund_policy(hours_before_start numeric)
returns table (policy_tier text, refund_percent integer)
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
      when hours_before_start is null then 'no_appointment'
      when hours_before_start > 48 then 'more_than_48_hours'
      when hours_before_start >= 24 then 'between_24_and_48_hours'
      else 'less_than_24_hours'
    end,
    case
      when hours_before_start is null or hours_before_start > 48 then 100
      when hours_before_start >= 24 then 50
      else 0
    end;
$$;

create or replace function private.create_refund_request(
  target_request uuid,
  input_tier text,
  input_percent integer,
  input_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.service_payments%rowtype;
  eligible integer;
  created_id uuid;
begin
  select * into payment from public.service_payments
  where service_request_id = target_request and status in ('paid', 'partially_refunded')
  order by paid_at desc nulls last limit 1;
  if payment.id is null then return null; end if;
  eligible := floor((payment.amount_total_cents - payment.refunded_amount_cents) * greatest(least(input_percent, 100), 0) / 100.0);
  if eligible <= 0 then return null; end if;
  insert into public.service_refunds (
    payment_id, service_request_id, household_id, customer_user_id, original_amount_cents,
    eligible_amount_cents, policy_tier, reason, requested_by
  ) values (
    payment.id, target_request, payment.household_id, payment.payer_user_id, payment.amount_total_cents,
    eligible, input_tier, left(btrim(coalesce(nullif(input_reason, ''), input_tier)), 1000), auth.uid()
  ) returning id into created_id;
  perform private.notify_request_administrators(target_request, 'admin_refund_requested', jsonb_build_object('amount_cents', eligible));
  return created_id;
end;
$$;

-- 6. Household: create and act on requests -----------------------------------

create or replace function public.create_service_request(
  input_service_type text,
  input_dependent_id uuid,
  input_description text,
  input_preferred_language text,
  input_idempotency_key uuid,
  input_relevant_information text default null,
  input_consultation_category text default null,
  input_consultation_topic_key text default null,
  input_iep_language text default null,
  input_iep_services text[] default null,
  input_delivery_method text default 'remote',
  input_preferred_location_type text default null,
  input_preferred_location_details text default null,
  input_requested_meeting_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_household uuid := private.current_household_id();
  target_service public.services%rowtype;
  existing_id uuid;
  created_id uuid;
  service_item text;
  normalized_services text[];
begin
  if current_user_id is null or target_household is null
    or not private.household_actor_can(target_household, 'submit_requests') then
    raise exception 'You do not have permission to request services.' using errcode = '42501';
  end if;
  select id into existing_id from public.service_requests
  where requested_by = current_user_id and idempotency_key = input_idempotency_key;
  if existing_id is not null then return existing_id; end if;

  select * into target_service from public.services
  where service_type = input_service_type and active and service_type in ('consultation', 'iep_language_assistance');
  if target_service.id is null then
    raise exception 'This service is not available.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.dependents
    where id = input_dependent_id and household_id = target_household and archived_at is null
  ) then
    raise exception 'Choose a dependent from your household.' using errcode = '22023';
  end if;
  if input_requested_meeting_date is not null and input_requested_meeting_date < current_date then
    raise exception 'The requested meeting date must be in the future.' using errcode = '22023';
  end if;
  if (select count(*) from public.service_requests
      where household_id = target_household
        and status not in ('completed', 'cancelled', 'declined')) >= 10 then
    raise exception 'Too many open service requests.' using errcode = '54000';
  end if;

  if input_service_type = 'consultation' then
    if input_consultation_topic_key is not null and not exists (
      select 1 from public.consultation_topics
      where topic_key = input_consultation_topic_key and active and category = input_consultation_category
    ) then
      raise exception 'Choose an available consultation topic.' using errcode = '22023';
    end if;
    normalized_services := array[]::text[];
  else
    select coalesce(array_agg(distinct item order by item), array[]::text[]) into normalized_services
    from unnest(coalesce(input_iep_services, array[]::text[])) as item;
  end if;

  insert into public.service_requests (
    household_id, dependent_id, service_id, service_type, requested_by, description,
    relevant_information, consultation_category, consultation_topic_key, preferred_language,
    iep_language, iep_services, delivery_method, preferred_location_type,
    preferred_location_details, requested_meeting_date, idempotency_key
  ) values (
    target_household, input_dependent_id, target_service.id, input_service_type, current_user_id,
    btrim(coalesce(input_description, '')),
    nullif(btrim(coalesce(input_relevant_information, '')), ''),
    case when input_service_type = 'consultation' then input_consultation_category end,
    case when input_service_type = 'consultation' then nullif(input_consultation_topic_key, '') end,
    input_preferred_language,
    case when input_service_type = 'iep_language_assistance' then input_iep_language end,
    normalized_services,
    case when input_service_type = 'consultation' then 'remote' else input_delivery_method end,
    case when input_service_type = 'iep_language_assistance' and input_delivery_method = 'in_person' then input_preferred_location_type end,
    case when input_service_type = 'iep_language_assistance' and input_delivery_method = 'in_person'
      then nullif(btrim(coalesce(input_preferred_location_details, '')), '') end,
    case when input_service_type = 'iep_language_assistance' then input_requested_meeting_date end,
    input_idempotency_key
  ) returning id into created_id;

  if input_service_type = 'consultation' then
    insert into public.service_request_activities (service_request_id, activity_type)
    values (created_id, 'consultation_session');
  else
    foreach service_item in array normalized_services loop
      insert into public.service_request_activities (service_request_id, activity_type)
      values (created_id, service_item);
    end loop;
  end if;

  perform private.record_request_event(created_id, 'request_created', null, 'pending_review');
  perform private.notify_request_household(created_id, 'request_received');
  perform private.notify_request_administrators(created_id, 'admin_new_request');
  return created_id;
end;
$$;

create or replace function private.lock_request_for_household(
  target_request uuid,
  required_permission text
)
returns public.service_requests
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  select * into request from public.service_requests where id = target_request for update;
  if request.id is null or not private.household_actor_can(request.household_id, required_permission) then
    raise exception 'Service request is unavailable.' using errcode = '42501';
  end if;
  return request;
end;
$$;

create or replace function private.assert_version(request public.service_requests, expected_version integer)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if expected_version is not null and request.version <> expected_version then
    raise exception 'This request changed; refresh and try again.' using errcode = '40001';
  end if;
end;
$$;

create or replace function private.assert_no_specialist_conflict(
  target_specialist uuid,
  input_start timestamptz,
  input_end timestamptz,
  ignored_appointment uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.service_appointments
    where specialist_id = target_specialist
      and status = 'confirmed'
      and (ignored_appointment is null or id <> ignored_appointment)
      and tstzrange(start_at, end_at, '[)') && tstzrange(input_start, input_end, '[)')
  ) then
    raise exception 'The specialist already has an appointment at that time.' using errcode = 'ES409';
  end if;
end;
$$;

create or replace function public.confirm_service_appointment(target_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment public.service_appointments%rowtype;
  request public.service_requests%rowtype;
begin
  select * into appointment from public.service_appointments where id = target_appointment_id for update;
  if appointment.id is null then
    raise exception 'Appointment is unavailable.' using errcode = '42501';
  end if;
  request := private.lock_request_for_household(appointment.service_request_id, 'confirm_appointments');
  if appointment.status <> 'proposed' or appointment.start_at <= now() then
    raise exception 'This appointment option is no longer available.' using errcode = '55000';
  end if;
  if appointment.kind = 'primary' and request.payment_status <> 'paid' then
    raise exception 'Payment is required before the appointment can be confirmed.' using errcode = 'ES402';
  end if;
  if request.status in ('cancelled', 'declined', 'completed') then
    raise exception 'This request is closed.' using errcode = '55000';
  end if;
  perform private.assert_no_specialist_conflict(appointment.specialist_id, appointment.start_at, appointment.end_at, appointment.id);

  update public.service_appointments
  set status = 'confirmed', customer_confirmed = true, confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
  where id = appointment.id;
  update public.service_appointments
  set status = 'declined', updated_at = now()
  where service_request_id = appointment.service_request_id and kind = appointment.kind
    and status = 'proposed' and id <> appointment.id;

  if appointment.kind = 'primary' then
    perform private.set_request_status(request.id, 'appointment_confirmed', 'appointment_confirmed',
      jsonb_build_object('start_at', appointment.start_at));
  else
    update public.service_requests set follow_up_status = 'scheduled' where id = request.id;
    perform private.touch_request(request.id);
    perform private.record_request_event(request.id, 'follow_up_confirmed', request.status, request.status,
      jsonb_build_object('start_at', appointment.start_at));
  end if;
  perform private.sync_request_appointment_status(request.id);
  perform private.notify_request_household(request.id, 'appointment_confirmed', jsonb_build_object('start_at', appointment.start_at, 'kind', appointment.kind));
  perform private.notify_request_specialist(request.id, 'specialist_appointment_confirmed', jsonb_build_object('start_at', appointment.start_at, 'kind', appointment.kind));
end;
$$;

create or replace function public.request_other_appointment_times(target_request_id uuid, input_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.service_requests%rowtype;
  affected_kind text;
begin
  request := private.lock_request_for_household(target_request_id, 'confirm_appointments');
  select kind into affected_kind from public.service_appointments
  where service_request_id = request.id and status = 'proposed' limit 1;
  if affected_kind is null then
    raise exception 'There are no proposed times to decline.' using errcode = '55000';
  end if;
  update public.service_appointments set status = 'declined', updated_at = now()
  where service_request_id = request.id and status = 'proposed';
  if affected_kind = 'primary' and request.payment_status = 'paid' then
    perform private.set_request_status(request.id, 'reschedule_requested', 'other_times_requested',
      jsonb_build_object('note', left(coalesce(input_note, ''), 500)));
  else
    perform private.touch_request(request.id);
    perform private.record_request_event(request.id, 'other_times_requested', request.status, request.status,
      jsonb_build_object('note', left(coalesce(input_note, ''), 500), 'kind', affected_kind));
  end if;
  perform private.sync_request_appointment_status(request.id);
  perform private.notify_request_administrators(request.id, 'admin_reschedule_requested');
end;
$$;

create or replace function public.request_service_reschedule(target_request_id uuid, input_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.service_requests%rowtype;
  appointment public.service_appointments%rowtype;
  hours_before numeric;
  policy record;
begin
  request := private.lock_request_for_household(target_request_id, 'confirm_appointments');
  select * into appointment from public.service_appointments
  where service_request_id = request.id and status = 'confirmed'
  order by start_at limit 1 for update;
  if appointment.id is null or appointment.start_at <= now() then
    raise exception 'There is no upcoming appointment to reschedule.' using errcode = '55000';
  end if;
  hours_before := extract(epoch from appointment.start_at - now()) / 3600;
  if hours_before <= 48 then
    if request.late_reschedule_used then
      raise exception 'This appointment has already been rescheduled once within 48 hours.' using errcode = 'ES410';
    end if;
    select * into policy from public.service_refund_policy(hours_before);
    update public.service_requests
    set late_reschedule_used = true,
        refund_cap_percent = least(refund_cap_percent, policy.refund_percent)
    where id = request.id;
  end if;

  update public.service_appointments
  set status = 'cancelled', cancellation_kind = 'customer_rescheduled',
      cancellation_reason = nullif(left(btrim(coalesce(input_reason, '')), 1000), ''),
      cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now()
  where id = appointment.id;

  if appointment.kind = 'primary' then
    perform private.set_request_status(request.id, 'reschedule_requested', 'reschedule_requested',
      jsonb_build_object('hours_before', round(hours_before, 1)));
  else
    update public.service_requests set follow_up_status = 'requested' where id = request.id;
    perform private.touch_request(request.id);
    perform private.record_request_event(request.id, 'follow_up_reschedule_requested', request.status, request.status);
  end if;
  perform private.sync_request_appointment_status(request.id);
  perform private.notify_request_household(request.id, 'appointment_rescheduled', jsonb_build_object('start_at', appointment.start_at));
  perform private.notify_request_specialist(request.id, 'specialist_appointment_rescheduled', jsonb_build_object('start_at', appointment.start_at));
  perform private.notify_request_administrators(request.id, 'admin_reschedule_requested');
end;
$$;

create or replace function public.cancel_service_request(target_request_id uuid, input_reason text default null)
returns table (refund_percent integer, refund_tier text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.service_requests%rowtype;
  appointment public.service_appointments%rowtype;
  hours_before numeric;
  policy record;
  tier text;
  percent integer;
begin
  request := private.lock_request_for_household(target_request_id, 'submit_requests');
  if request.status in ('completed', 'cancelled', 'declined', 'in_progress') then
    raise exception 'This request can no longer be cancelled.' using errcode = '55000';
  end if;
  if request.payment_status in ('pending', 'processing') then
    raise exception 'Wait for the payment to finish before cancelling.' using errcode = '55000';
  end if;

  select * into appointment from public.service_appointments
  where service_request_id = request.id and kind = 'primary' and status = 'confirmed'
  order by start_at limit 1;

  if request.payment_status not in ('paid', 'partially_refunded') then
    tier := 'no_appointment'; percent := 0;
  elsif request.full_refund_eligible then
    tier := 'administrative_cancellation'; percent := 100;
  elsif request.status = 'no_show' then
    tier := 'no_show'; percent := 0;
  else
    if appointment.id is not null then
      hours_before := extract(epoch from appointment.start_at - now()) / 3600;
    end if;
    select * into policy from public.service_refund_policy(hours_before);
    tier := policy.policy_tier;
    percent := least(policy.refund_percent, request.refund_cap_percent);
  end if;

  update public.service_appointments
  set status = 'cancelled', cancellation_kind = 'customer_cancelled',
      cancellation_reason = nullif(left(btrim(coalesce(input_reason, '')), 1000), ''),
      cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now()
  where service_request_id = request.id and status in ('proposed', 'confirmed');

  update public.service_requests
  set cancelled_at = now(), cancelled_by = auth.uid(),
      cancellation_reason = nullif(left(btrim(coalesce(input_reason, '')), 1000), '')
  where id = request.id;
  perform private.set_request_status(request.id, 'cancelled', 'request_cancelled',
    jsonb_build_object('refund_tier', tier, 'refund_percent', percent));
  perform private.sync_request_appointment_status(request.id);

  if percent > 0 then
    perform private.create_refund_request(request.id, tier, percent, coalesce(nullif(btrim(input_reason), ''), 'Customer cancellation'));
  end if;

  perform private.notify_request_household(request.id, 'appointment_cancelled', jsonb_build_object('refund_percent', percent));
  perform private.notify_request_specialist(request.id, 'specialist_appointment_cancelled');
  perform private.notify_request_administrators(request.id, 'admin_cancellation', jsonb_build_object('refund_percent', percent));
  return query select percent, tier;
end;
$$;

create or replace function public.request_service_follow_up(target_request_id uuid, input_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  request := private.lock_request_for_household(target_request_id, 'submit_requests');
  if request.follow_up_status <> 'available' or request.status in ('cancelled', 'declined') then
    raise exception 'A follow-up is not available for this request.' using errcode = '55000';
  end if;
  update public.service_requests set follow_up_status = 'requested' where id = request.id;
  perform private.touch_request(request.id);
  perform private.record_request_event(request.id, 'follow_up_requested', request.status, request.status,
    jsonb_build_object('note', left(coalesce(input_note, ''), 500)));
  perform private.notify_request_specialist(request.id, 'specialist_follow_up_required');
  perform private.notify_request_administrators(request.id, 'admin_follow_up_requested');
end;
$$;

-- 7. Administrator workflow ------------------------------------------------

create or replace function private.lock_request_for_staff(target_request uuid, allow_specialist boolean)
returns public.service_requests
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  select * into request from public.service_requests where id = target_request for update;
  if request.id is null or not (
    private.is_current_user_administrator()
    or (allow_specialist and private.is_request_specialist(target_request))
  ) then
    raise exception 'Service request is unavailable.' using errcode = '42501';
  end if;
  return request;
end;
$$;

create or replace function private.specialist_matches_request(target_specialist uuid, target_request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_requests as request
    join public.specialist_capabilities as capability
      on capability.specialist_id = target_specialist
     and capability.service_type = request.service_type
     and capability.delivery_method = request.delivery_method
     and capability.language = case
       when request.service_type = 'iep_language_assistance' then request.iep_language
       else request.preferred_language
     end
    where request.id = target_request
  );
$$;

create or replace function public.admin_list_matching_specialists(target_request_id uuid)
returns table (
  specialist_id uuid,
  display_name text,
  availability_status text,
  is_match boolean,
  is_eligible boolean,
  active_request_count bigint,
  capabilities jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator();
  return query
  select specialist.id,
    private.specialist_display_name(specialist.id),
    specialist.availability_status,
    private.specialist_matches_request(specialist.id, target_request_id),
    specialist.availability_status = 'available' and private.specialist_matches_request(specialist.id, target_request_id),
    (select count(*) from public.service_requests as open_request
      where open_request.specialist_id = specialist.id
        and open_request.status not in ('completed', 'cancelled', 'declined')),
    coalesce((
      select jsonb_agg(jsonb_build_object('service_type', capability.service_type, 'language', capability.language, 'delivery_method', capability.delivery_method))
      from public.specialist_capabilities as capability where capability.specialist_id = specialist.id
    ), '[]'::jsonb)
  from public.specialists as specialist
  join public.user_roles as role_row on role_row.user_id = specialist.user_id and role_row.role = 'specialist'::public.app_role
  order by 5 desc, 4 desc, 6, 2;
end;
$$;

create or replace function public.admin_assign_service_specialist(
  target_request_id uuid,
  target_specialist_id uuid,
  expected_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype; previous_specialist uuid;
begin
  request := private.lock_request_for_staff(target_request_id, false);
  perform private.assert_version(request, expected_version);
  if request.status not in ('pending_review', 'assigned', 'awaiting_availability', 'awaiting_payment', 'payment_failed', 'appointment_proposed', 'reschedule_requested') then
    raise exception 'The specialist cannot be changed at this stage.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.specialists as specialist
    join public.user_roles as role_row on role_row.user_id = specialist.user_id and role_row.role = 'specialist'::public.app_role
    where specialist.id = target_specialist_id and specialist.availability_status = 'available'
  ) then
    raise exception 'The specialist is not available.' using errcode = '22023';
  end if;
  if not private.specialist_matches_request(target_specialist_id, request.id) then
    raise exception 'The specialist does not offer this service, language, and delivery method.' using errcode = '22023';
  end if;
  previous_specialist := request.specialist_id;
  if previous_specialist is not null and previous_specialist <> target_specialist_id and exists (
    select 1 from public.service_appointments where service_request_id = request.id and status = 'confirmed'
  ) then
    raise exception 'Cancel the confirmed appointment before reassigning the specialist.' using errcode = '55000';
  end if;
  if previous_specialist is distinct from target_specialist_id then
    -- Proposed times belonged to the previous specialist's calendar.
    update public.service_appointments set status = 'superseded', updated_at = now()
    where service_request_id = request.id and status = 'proposed';
  end if;
  update public.service_requests
  set specialist_id = target_specialist_id, availability_requested_at = null
  where id = request.id;
  if request.status = 'pending_review' then
    perform private.set_request_status(request.id, 'assigned', 'specialist_assigned',
      jsonb_build_object('reassigned', false));
  elsif previous_specialist is distinct from target_specialist_id
    and request.status in ('appointment_proposed', 'awaiting_availability', 'awaiting_payment') then
    -- The previous specialist's proposals were withdrawn above, so scheduling restarts.
    perform private.set_request_status(request.id,
      case when request.payment_status = 'paid' then 'reschedule_requested' else 'assigned' end,
      'specialist_assigned', jsonb_build_object('reassigned', true));
  else
    perform private.touch_request(request.id);
    perform private.record_request_event(request.id, 'specialist_assigned', request.status, request.status,
      jsonb_build_object('reassigned', previous_specialist is not null));
  end if;
  perform private.sync_request_appointment_status(request.id);
  perform private.notify_request_household(request.id, 'specialist_assigned');
  perform private.notify_request_specialist(request.id, 'specialist_new_assignment');
end;
$$;

create or replace function public.admin_request_specialist_availability(target_request_id uuid, expected_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  request := private.lock_request_for_staff(target_request_id, false);
  perform private.assert_version(request, expected_version);
  if request.specialist_id is null or request.status not in ('assigned', 'reschedule_requested', 'awaiting_payment', 'payment_failed') then
    raise exception 'Assign a specialist before requesting availability.' using errcode = '55000';
  end if;
  update public.service_requests set availability_requested_at = now() where id = request.id;
  if request.status = 'assigned' then
    perform private.set_request_status(request.id, 'awaiting_availability', 'availability_requested');
  else
    perform private.touch_request(request.id);
    perform private.record_request_event(request.id, 'availability_requested', request.status, request.status);
  end if;
  perform private.notify_request_specialist(request.id, 'specialist_availability_requested');
end;
$$;

-- slot shape: {"local_start": "2026-10-15T14:30", "timezone": "America/Chicago",
--   "location_type": "school_meeting", "location_details": "...", "meeting_url": "https://...", "instructions": "..."}
create or replace function private.insert_service_appointment(
  request public.service_requests,
  input_kind text,
  slot jsonb,
  input_status text,
  input_group uuid,
  input_role text,
  input_scheduled_directly boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_start timestamp;
  zone text := btrim(coalesce(slot ->> 'timezone', ''));
  start_instant timestamptz;
  duration integer;
  location text := coalesce(nullif(btrim(slot ->> 'location_type'), ''), case when request.delivery_method = 'remote' then 'remote' end);
  details text := nullif(btrim(coalesce(slot ->> 'location_details', '')), '');
  url text := nullif(btrim(coalesce(slot ->> 'meeting_url', '')), '');
  note text := nullif(btrim(coalesce(slot ->> 'instructions', '')), '');
  created_id uuid;
begin
  if jsonb_typeof(slot) <> 'object' or coalesce(slot ->> 'local_start', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then
    raise exception 'Each appointment time needs a valid local date and time.' using errcode = '22023';
  end if;
  local_start := (slot ->> 'local_start')::timestamp;
  start_instant := private.resolve_appointment_instant(local_start, zone);
  if start_instant < now() + interval '1 hour' or start_instant > now() + interval '180 days' then
    raise exception 'Appointments must start at least one hour from now and within 180 days.' using errcode = '22023';
  end if;
  select duration_minutes into duration from public.services where id = request.service_id;
  if request.delivery_method = 'remote' then
    location := 'remote';
  elsif location not in ('ethiospectrum_location', 'school_meeting', 'mutually_agreed') then
    raise exception 'Choose an approved in-person location.' using errcode = '22023';
  elsif location in ('school_meeting', 'mutually_agreed') and details is null then
    raise exception 'Location details are required for this location.' using errcode = '22023';
  end if;
  if url is not null and (url !~ '^https://' or char_length(url) > 2048) then
    raise exception 'Meeting links must use HTTPS.' using errcode = '22023';
  end if;
  if char_length(coalesce(details, '')) > 500 or char_length(coalesce(note, '')) > 1000 then
    raise exception 'Location details or instructions are too long.' using errcode = '22023';
  end if;
  if input_status = 'confirmed' then
    perform private.assert_no_specialist_conflict(request.specialist_id, start_instant, start_instant + make_interval(mins => duration));
  end if;
  insert into public.service_appointments (
    service_request_id, household_id, specialist_id, kind, proposal_group, start_at, end_at, timezone,
    delivery_method, location_type, location_details, meeting_url, instructions, status,
    scheduled_directly, proposed_by, proposed_by_role, confirmed_by, confirmed_at
  ) values (
    request.id, request.household_id, request.specialist_id, input_kind, input_group, start_instant,
    start_instant + make_interval(mins => duration), zone, request.delivery_method, location, details, url, note,
    input_status, input_scheduled_directly, auth.uid(), input_role,
    case when input_status = 'confirmed' then auth.uid() end,
    case when input_status = 'confirmed' then now() end
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.propose_service_appointments(
  target_request_id uuid,
  input_kind text,
  input_slots jsonb,
  expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.service_requests%rowtype;
  slot jsonb;
  proposal uuid := gen_random_uuid();
  role_name text;
  slot_count integer;
  earliest timestamptz;
begin
  request := private.lock_request_for_staff(target_request_id, true);
  perform private.assert_version(request, expected_version);
  role_name := case when private.is_current_user_administrator() then 'administrator' else 'specialist' end;
  if input_kind not in ('primary', 'follow_up') or jsonb_typeof(input_slots) <> 'array' then
    raise exception 'Invalid appointment proposal.' using errcode = '22023';
  end if;
  slot_count := jsonb_array_length(input_slots);
  if slot_count < 1 or slot_count > 3 then
    raise exception 'Propose between one and three appointment times.' using errcode = '22023';
  end if;
  if request.specialist_id is null then
    raise exception 'Assign a specialist before proposing times.' using errcode = '55000';
  end if;
  if input_kind = 'primary' then
    if request.status not in ('assigned', 'awaiting_availability', 'awaiting_payment', 'payment_failed', 'appointment_proposed', 'reschedule_requested') then
      raise exception 'Appointment times cannot be proposed at this stage.' using errcode = '55000';
    end if;
    if role_name = 'specialist' and request.status <> 'awaiting_availability' and request.availability_requested_at is null then
      raise exception 'The administrator has not requested your availability.' using errcode = '42501';
    end if;
    if exists (select 1 from public.service_appointments where service_request_id = request.id and kind = 'primary' and status = 'confirmed') then
      raise exception 'This request already has a confirmed appointment.' using errcode = '55000';
    end if;
  else
    if request.follow_up_status not in ('available', 'requested') or request.status in ('cancelled', 'declined', 'completed') then
      raise exception 'A follow-up cannot be proposed at this stage.' using errcode = '55000';
    end if;
  end if;

  update public.service_appointments set status = 'superseded', updated_at = now()
  where service_request_id = request.id and kind = input_kind and status = 'proposed';
  for slot in select value from jsonb_array_elements(input_slots) loop
    perform private.insert_service_appointment(request, input_kind, slot, 'proposed', proposal, role_name, false);
  end loop;
  select min(start_at) into earliest from public.service_appointments where proposal_group = proposal;

  if input_kind = 'primary' then
    update public.service_requests set availability_requested_at = null where id = request.id;
    perform private.set_request_status(request.id,
      case when request.payment_status = 'paid' then 'appointment_proposed' else 'awaiting_payment' end,
      'appointment_proposed', jsonb_build_object('options', slot_count, 'proposed_by', role_name));
  else
    update public.service_requests set follow_up_status = 'requested' where id = request.id;
    perform private.touch_request(request.id);
    perform private.record_request_event(request.id, 'follow_up_proposed', request.status, request.status,
      jsonb_build_object('options', slot_count));
  end if;
  perform private.sync_request_appointment_status(request.id);
  perform private.notify_request_household(request.id, 'appointment_proposed', jsonb_build_object('start_at', earliest, 'options', slot_count, 'kind', input_kind));
  if role_name = 'administrator' then
    perform private.notify_request_specialist(request.id, 'specialist_appointment_proposed', jsonb_build_object('start_at', earliest, 'kind', input_kind));
  else
    perform private.notify_request_administrators(request.id, 'admin_availability_submitted');
  end if;
  return slot_count;
end;
$$;

create or replace function public.admin_schedule_service_appointment(
  target_request_id uuid,
  input_kind text,
  input_slot jsonb,
  expected_version integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.service_requests%rowtype;
  created_id uuid;
  starts timestamptz;
begin
  request := private.lock_request_for_staff(target_request_id, false);
  perform private.assert_version(request, expected_version);
  if request.specialist_id is null then
    raise exception 'Assign a specialist before scheduling.' using errcode = '55000';
  end if;
  if input_kind = 'primary' then
    if request.status not in ('assigned', 'awaiting_availability', 'awaiting_payment', 'payment_failed', 'appointment_proposed', 'reschedule_requested', 'no_show') then
      raise exception 'The appointment cannot be scheduled at this stage.' using errcode = '55000';
    end if;
    if exists (select 1 from public.service_appointments where service_request_id = request.id and kind = 'primary' and status = 'confirmed') then
      raise exception 'Modify the confirmed appointment instead.' using errcode = '55000';
    end if;
  elsif input_kind = 'follow_up' then
    if request.follow_up_status not in ('available', 'requested') then
      raise exception 'A follow-up cannot be scheduled at this stage.' using errcode = '55000';
    end if;
  else
    raise exception 'Invalid appointment kind.' using errcode = '22023';
  end if;
  update public.service_appointments set status = 'superseded', updated_at = now()
  where service_request_id = request.id and kind = input_kind and status = 'proposed';
  created_id := private.insert_service_appointment(request, input_kind, input_slot, 'confirmed', gen_random_uuid(), 'administrator', true);
  select start_at into starts from public.service_appointments where id = created_id;
  if input_kind = 'primary' then
    perform private.set_request_status(request.id,
      case when request.payment_status = 'paid' then 'appointment_confirmed' else 'awaiting_payment' end,
      'appointment_scheduled_directly', jsonb_build_object('start_at', starts));
  else
    update public.service_requests set follow_up_status = 'scheduled' where id = request.id;
    perform private.touch_request(request.id);
    perform private.record_request_event(request.id, 'follow_up_scheduled_directly', request.status, request.status,
      jsonb_build_object('start_at', starts));
  end if;
  perform private.sync_request_appointment_status(request.id);
  perform private.notify_request_household(request.id, 'appointment_confirmed', jsonb_build_object('start_at', starts, 'kind', input_kind, 'scheduled_directly', true));
  perform private.notify_request_specialist(request.id, 'specialist_appointment_confirmed', jsonb_build_object('start_at', starts, 'kind', input_kind));
  return created_id;
end;
$$;

create or replace function public.admin_modify_service_appointment(target_appointment_id uuid, input_slot jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment public.service_appointments%rowtype;
  request public.service_requests%rowtype;
  replacement uuid;
  replacement_row public.service_appointments%rowtype;
begin
  select * into appointment from public.service_appointments where id = target_appointment_id for update;
  if appointment.id is null then
    raise exception 'Appointment is unavailable.' using errcode = '42501';
  end if;
  request := private.lock_request_for_staff(appointment.service_request_id, false);
  if appointment.status not in ('proposed', 'confirmed') then
    raise exception 'Only proposed or confirmed appointments can be modified.' using errcode = '55000';
  end if;
  -- Build the replacement as a validated row, then copy its values in place so
  -- the appointment keeps its identity and confirmation.
  replacement := private.insert_service_appointment(request, appointment.kind, input_slot, 'proposed', appointment.proposal_group, 'administrator', appointment.scheduled_directly);
  select * into replacement_row from public.service_appointments where id = replacement;
  delete from public.service_appointments where id = replacement;
  if appointment.status = 'confirmed' then
    perform private.assert_no_specialist_conflict(appointment.specialist_id, replacement_row.start_at, replacement_row.end_at, appointment.id);
  end if;
  update public.service_appointments
  set start_at = replacement_row.start_at, end_at = replacement_row.end_at, timezone = replacement_row.timezone,
      location_type = replacement_row.location_type, location_details = replacement_row.location_details,
      meeting_url = replacement_row.meeting_url, instructions = replacement_row.instructions,
      reminder_sent_at = null, updated_at = now()
  where id = appointment.id;
  perform private.touch_request(request.id);
  perform private.record_request_event(request.id, 'appointment_modified', request.status, request.status,
    jsonb_build_object('previous_start_at', appointment.start_at, 'start_at', replacement_row.start_at));
  perform private.notify_request_household(request.id, 'appointment_rescheduled', jsonb_build_object('start_at', replacement_row.start_at));
  perform private.notify_request_specialist(request.id, 'specialist_appointment_rescheduled', jsonb_build_object('start_at', replacement_row.start_at));
end;
$$;

create or replace function public.admin_cancel_service_appointment(target_appointment_id uuid, input_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment public.service_appointments%rowtype;
  request public.service_requests%rowtype;
begin
  select * into appointment from public.service_appointments where id = target_appointment_id for update;
  if appointment.id is null then
    raise exception 'Appointment is unavailable.' using errcode = '42501';
  end if;
  request := private.lock_request_for_staff(appointment.service_request_id, false);
  if appointment.status not in ('proposed', 'confirmed') then
    raise exception 'This appointment is not active.' using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(input_reason, ''))) < 2 then
    raise exception 'A cancellation reason is required.' using errcode = '22023';
  end if;
  update public.service_appointments
  set status = 'cancelled', cancellation_kind = 'administrative', cancellation_reason = left(btrim(input_reason), 1000),
      cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now()
  where id = appointment.id;
  if appointment.kind = 'primary' and appointment.status = 'confirmed' then
    -- PRD: an Ethiospectrum cancellation entitles the customer to a full refund or a reschedule.
    update public.service_requests set full_refund_eligible = true where id = request.id;
    perform private.set_request_status(request.id,
      case when request.payment_status = 'paid' then 'reschedule_requested' else 'assigned' end,
      'appointment_cancelled_by_ethiospectrum');
  elsif appointment.kind = 'follow_up' and appointment.status = 'confirmed' then
    update public.service_requests set follow_up_status = 'requested' where id = request.id;
    perform private.touch_request(request.id);
    perform private.record_request_event(request.id, 'follow_up_cancelled_by_ethiospectrum', request.status, request.status);
  else
    perform private.touch_request(request.id);
    perform private.record_request_event(request.id, 'proposal_withdrawn', request.status, request.status);
  end if;
  perform private.sync_request_appointment_status(request.id);
  perform private.notify_request_household(request.id, 'appointment_cancelled', jsonb_build_object('start_at', appointment.start_at, 'administrative', true));
  perform private.notify_request_specialist(request.id, 'specialist_appointment_cancelled', jsonb_build_object('start_at', appointment.start_at));
end;
$$;

create or replace function public.admin_cancel_service_request(target_request_id uuid, input_reason text, input_full_refund boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  request := private.lock_request_for_staff(target_request_id, false);
  if request.status in ('completed', 'cancelled', 'declined') then
    raise exception 'This request is already closed.' using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(input_reason, ''))) < 2 then
    raise exception 'A cancellation reason is required.' using errcode = '22023';
  end if;
  update public.service_appointments
  set status = 'cancelled', cancellation_kind = 'administrative', cancellation_reason = left(btrim(input_reason), 1000),
      cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now()
  where service_request_id = request.id and status in ('proposed', 'confirmed');
  update public.service_requests
  set cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = left(btrim(input_reason), 1000)
  where id = request.id;
  perform private.set_request_status(request.id, 'cancelled', 'request_cancelled_by_ethiospectrum');
  perform private.sync_request_appointment_status(request.id);
  if coalesce(input_full_refund, true) then
    perform private.create_refund_request(request.id, 'administrative_cancellation', 100, left(btrim(input_reason), 1000));
  end if;
  perform private.notify_request_household(request.id, 'appointment_cancelled', jsonb_build_object('administrative', true));
  perform private.notify_request_specialist(request.id, 'specialist_appointment_cancelled');
end;
$$;

create or replace function public.admin_decline_service_request(target_request_id uuid, input_reason text, expected_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  request := private.lock_request_for_staff(target_request_id, false);
  perform private.assert_version(request, expected_version);
  if request.payment_status not in ('unpaid', 'failed') or request.status in ('completed', 'cancelled', 'declined') then
    raise exception 'Paid or closed requests cannot be declined; cancel with a refund instead.' using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(input_reason, ''))) < 2 then
    raise exception 'A reason is required.' using errcode = '22023';
  end if;
  update public.service_appointments set status = 'cancelled', cancellation_kind = 'administrative',
    cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now()
  where service_request_id = request.id and status in ('proposed', 'confirmed');
  update public.service_requests set declined_reason = left(btrim(input_reason), 1000) where id = request.id;
  perform private.set_request_status(request.id, 'declined', 'request_declined');
  perform private.sync_request_appointment_status(request.id);
  perform private.notify_request_household(request.id, 'request_declined');
end;
$$;

create or replace function public.admin_override_service_status(target_request_id uuid, input_status text, input_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  request := private.lock_request_for_staff(target_request_id, false);
  if input_status not in ('pending_review', 'assigned', 'awaiting_availability', 'awaiting_payment',
      'appointment_proposed', 'appointment_confirmed', 'in_progress', 'reschedule_requested', 'no_show') then
    raise exception 'Use the dedicated action for this status.' using errcode = '22023';
  end if;
  if request.status in ('completed', 'cancelled', 'declined') then
    raise exception 'Closed requests cannot be changed.' using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(input_reason, ''))) < 2 then
    raise exception 'A reason is required.' using errcode = '22023';
  end if;
  perform private.set_request_status(request.id, input_status, 'status_overridden',
    jsonb_build_object('reason', left(btrim(input_reason), 500)));
end;
$$;

-- 8. Specialist or administrator service delivery -------------------------

create or replace function public.record_service_appointment_outcome(
  target_appointment_id uuid,
  input_outcome text,
  input_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment public.service_appointments%rowtype;
  request public.service_requests%rowtype;
  follow_ups integer;
begin
  select * into appointment from public.service_appointments where id = target_appointment_id for update;
  if appointment.id is null then
    raise exception 'Appointment is unavailable.' using errcode = '42501';
  end if;
  request := private.lock_request_for_staff(appointment.service_request_id, true);
  if appointment.status <> 'confirmed' or input_outcome not in ('completed', 'no_show') then
    raise exception 'Only confirmed appointments can be recorded.' using errcode = '55000';
  end if;
  if appointment.start_at > now() then
    raise exception 'The appointment has not started yet.' using errcode = '55000';
  end if;
  if appointment.kind = 'primary' and request.payment_status <> 'paid' and input_outcome = 'completed' then
    raise exception 'Payment is required before the service is delivered.' using errcode = 'ES402';
  end if;
  update public.service_appointments
  set status = input_outcome, completed_by = auth.uid(), completed_at = now(),
      completion_notes = nullif(left(btrim(coalesce(input_notes, '')), 3000), ''), updated_at = now()
  where id = appointment.id;

  if appointment.kind = 'primary' and input_outcome = 'completed' then
    select included_follow_ups into follow_ups from public.services where id = request.service_id;
    update public.service_requests
    set primary_session_completed_at = now(),
        follow_up_status = case when coalesce(follow_ups, 0) > 0 and follow_up_status = 'not_available' then 'available' else follow_up_status end
    where id = request.id;
    update public.service_request_activities
    set status = 'completed', completed_by = auth.uid(), completed_at = now(), updated_at = now()
    where service_request_id = request.id and activity_type = 'consultation_session' and status <> 'completed';
    perform private.set_request_status(request.id, 'in_progress', 'session_completed');
    if coalesce(follow_ups, 0) > 0 then
      perform private.notify_request_household(request.id, 'follow_up_available');
    end if;
  elsif appointment.kind = 'primary' then
    perform private.set_request_status(request.id, 'no_show', 'no_show_recorded');
    perform private.notify_request_administrators(request.id, 'admin_no_show');
  elsif input_outcome = 'completed' then
    update public.service_requests set follow_up_status = 'completed' where id = request.id;
    perform private.touch_request(request.id);
    perform private.record_request_event(request.id, 'follow_up_completed', request.status, request.status);
  else
    update public.service_requests set follow_up_status = 'available' where id = request.id;
    perform private.touch_request(request.id);
    perform private.record_request_event(request.id, 'follow_up_no_show', request.status, request.status);
  end if;
  perform private.sync_request_appointment_status(request.id);
end;
$$;

create or replace function public.update_service_activity(target_activity_id uuid, input_status text, input_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare activity public.service_request_activities%rowtype; request public.service_requests%rowtype;
begin
  select * into activity from public.service_request_activities where id = target_activity_id for update;
  if activity.id is null then
    raise exception 'Activity is unavailable.' using errcode = '42501';
  end if;
  request := private.lock_request_for_staff(activity.service_request_id, true);
  if input_status not in ('pending', 'in_progress', 'completed', 'not_needed') or request.status in ('cancelled', 'declined') then
    raise exception 'Invalid activity update.' using errcode = '22023';
  end if;
  update public.service_request_activities
  set status = input_status,
      notes = nullif(left(btrim(coalesce(input_notes, '')), 2000), ''),
      completed_by = case when input_status = 'completed' then auth.uid() end,
      completed_at = case when input_status = 'completed' then now() end,
      updated_at = now()
  where id = activity.id;
  perform private.touch_request(request.id);
  perform private.record_request_event(request.id, 'activity_updated', request.status, request.status,
    jsonb_build_object('activity_type', activity.activity_type, 'status', input_status));
end;
$$;

create or replace function public.complete_service_request(
  target_request_id uuid,
  input_notes text,
  input_waive_follow_up boolean default false,
  expected_version integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  request := private.lock_request_for_staff(target_request_id, true);
  perform private.assert_version(request, expected_version);
  if request.status <> 'in_progress' or request.primary_session_completed_at is null then
    raise exception 'Record the session before completing the service.' using errcode = '55000';
  end if;
  if request.follow_up_status in ('requested', 'scheduled') then
    raise exception 'Finish the follow-up before completing the service.' using errcode = '55000';
  end if;
  if request.follow_up_status = 'available' and not coalesce(input_waive_follow_up, false) then
    raise exception 'The included follow-up is still available.' using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(input_notes, ''))) < 2 then
    raise exception 'Completion notes are required.' using errcode = '22023';
  end if;
  update public.service_requests
  set completed_at = now(), completed_by = auth.uid(), completion_notes = left(btrim(input_notes), 3000),
      follow_up_status = case when follow_up_status = 'available' then 'waived' else follow_up_status end,
      status = 'completed', version = version + 1, updated_at = now()
  where id = request.id;
  perform private.record_request_event(request.id, 'service_completed', request.status, 'completed');
  perform private.notify_request_household(request.id, 'service_completed');
  if private.is_current_user_administrator() then
    perform private.notify_request_specialist(request.id, 'specialist_service_completed');
  else
    perform private.notify_request_administrators(request.id, 'admin_service_completed');
  end if;
end;
$$;

-- 9. Messages ----------------------------------------------------------------

create or replace function public.add_service_request_message(target_request_id uuid, input_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.service_requests%rowtype;
  kind text;
  created_id uuid;
begin
  select * into request from public.service_requests where id = target_request_id;
  if request.id is null or not private.can_read_service_request(request.id) then
    raise exception 'Service request is unavailable.' using errcode = '42501';
  end if;
  if private.is_request_household_member(request.id) then
    if not private.household_actor_can(request.household_id, 'submit_requests') then
      raise exception 'You do not have permission to send messages.' using errcode = '42501';
    end if;
    kind := 'household';
  elsif private.is_request_specialist(request.id) then
    kind := 'specialist';
  else
    kind := 'administrator';
  end if;
  if (select count(*) from public.service_request_messages where service_request_id = request.id) >= 200 then
    raise exception 'This conversation has reached its message limit.' using errcode = '54000';
  end if;
  insert into public.service_request_messages (service_request_id, author_id, author_kind, body)
  values (request.id, auth.uid(), kind, btrim(coalesce(input_body, '')))
  returning id into created_id;
  if kind = 'household' then
    perform private.notify_request_specialist(request.id, 'specialist_new_message');
  else
    perform private.notify_request_household(request.id, 'new_message');
  end if;
  return created_id;
end;
$$;

-- 10. Payments (provider-synchronized; card data stays with the provider) ----

create or replace function public.prepare_service_payment(
  target_request_id uuid,
  input_accepted_fee_ids uuid[],
  input_fees_acknowledged boolean
)
returns table (
  payment_id uuid,
  household_id uuid,
  service_type text,
  service_name text,
  base_amount_cents integer,
  fees jsonb,
  subtotal_cents integer,
  currency text,
  superseded_session_ids text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.service_requests%rowtype;
  target_service public.services%rowtype;
  active_fee_ids uuid[];
  fee_snapshot jsonb;
  fee_total integer;
  created_id uuid;
  superseded text[];
begin
  request := private.lock_request_for_household(target_request_id, 'make_payments');
  if request.status not in ('awaiting_payment', 'payment_failed') or request.payment_status in ('processing', 'paid', 'partially_refunded', 'refunded') then
    raise exception 'This request is not awaiting payment.' using errcode = '55000';
  end if;
  select * into target_service from public.services where id = request.service_id;
  select coalesce(array_agg(fee.id order by fee.id), array[]::uuid[]),
    coalesce(jsonb_agg(jsonb_build_object('id', fee.id, 'name', fee.name, 'amount_cents', fee.amount_cents) order by fee.id), '[]'::jsonb),
    coalesce(sum(fee.amount_cents), 0)
  into active_fee_ids, fee_snapshot, fee_total
  from public.service_fees as fee
  where fee.service_type = request.service_type and fee.active;
  if cardinality(active_fee_ids) > 0 and (
    not coalesce(input_fees_acknowledged, false)
    or (select coalesce(array_agg(value order by value), array[]::uuid[]) from (select distinct unnest(coalesce(input_accepted_fee_ids, array[]::uuid[])) as value) as accepted) <> active_fee_ids
  ) then
    raise exception 'Review and accept the additional fees before paying.' using errcode = 'ES422';
  end if;

  select coalesce(array_agg(provider_checkout_session_id) filter (where provider_checkout_session_id is not null), array[]::text[])
  into superseded
  from public.service_payments where service_request_id = request.id and status = 'pending';
  update public.service_payments
  set status = 'failed', failure_code = 'superseded', updated_at = now()
  where service_request_id = request.id and status = 'pending';

  insert into public.service_payments (
    household_id, service_request_id, payer_user_id, base_amount_cents, fee_amount_cents,
    accepted_fees, subtotal_cents, amount_total_cents
  ) values (
    request.household_id, request.id, auth.uid(), target_service.price_cents, fee_total,
    fee_snapshot, target_service.price_cents + fee_total, target_service.price_cents + fee_total
  ) returning id into created_id;
  update public.service_requests set payment_status = 'pending' where id = request.id;
  perform private.touch_request(request.id);
  perform private.record_request_event(request.id, 'payment_started', request.status, request.status,
    jsonb_build_object('amount_cents', target_service.price_cents + fee_total));
  return query select created_id, request.household_id, request.service_type, target_service.name,
    target_service.price_cents, fee_snapshot, target_service.price_cents + fee_total, 'usd'::text, superseded;
end;
$$;

create or replace function public.attach_service_payment_session(target_payment_id uuid, input_session_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Payment operation is unavailable.' using errcode = '42501';
  end if;
  update public.service_payments
  set provider_checkout_session_id = input_session_id, updated_at = now()
  where id = target_payment_id and status = 'pending' and provider_checkout_session_id is null;
  if not found then
    raise exception 'Payment is unavailable.' using errcode = '40001';
  end if;
end;
$$;

-- outcome: paid | processing | failed | expired
create or replace function public.sync_service_payment(
  target_payment_id uuid,
  input_session_id text,
  input_outcome text,
  input_provider_updated_at timestamptz,
  input_payment_intent_id text default null,
  input_amount_total_cents integer default null,
  input_tax_amount_cents integer default null,
  input_failure_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.service_payments%rowtype;
  request public.service_requests%rowtype;
  has_confirmed boolean;
  has_proposed boolean;
  other_paid boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or input_outcome not in ('paid', 'processing', 'failed', 'expired')
    or (input_failure_code is not null and input_failure_code !~ '^[a-z0-9_]{1,80}$') then
    raise exception 'Payment synchronization is unavailable.' using errcode = '42501';
  end if;
  select * into payment from public.service_payments where id = target_payment_id for update;
  if payment.id is null or payment.provider_checkout_session_id is distinct from input_session_id then
    raise exception 'Payment is unavailable.' using errcode = '42501';
  end if;
  select * into request from public.service_requests where id = payment.service_request_id for update;

  if payment.status in ('paid', 'partially_refunded', 'refunded') then
    return false; -- settled payments never regress
  end if;
  if payment.status = input_outcome or (payment.status = 'failed' and input_outcome = 'expired') then
    return false;
  end if;

  if input_outcome = 'paid' then
    select exists (
      select 1 from public.service_payments
      where service_request_id = payment.service_request_id and id <> payment.id
        and status in ('paid', 'partially_refunded', 'refunded')
    ) into other_paid;
    update public.service_payments
    set status = 'paid', paid_at = now(), provider_transaction_id = coalesce(input_payment_intent_id, provider_transaction_id),
        amount_total_cents = coalesce(input_amount_total_cents, amount_total_cents),
        tax_amount_cents = input_tax_amount_cents, failure_code = null,
        provider_updated_at = input_provider_updated_at, updated_at = now()
    where id = payment.id;
    if other_paid then
      -- A superseded checkout was completed after another succeeded: flag it for a full refund.
      insert into public.service_refunds (
        payment_id, service_request_id, household_id, customer_user_id, original_amount_cents,
        eligible_amount_cents, policy_tier, reason
      ) values (
        payment.id, payment.service_request_id, payment.household_id, payment.payer_user_id,
        coalesce(input_amount_total_cents, payment.amount_total_cents),
        coalesce(input_amount_total_cents, payment.amount_total_cents),
        'duplicate_payment', 'Duplicate payment for the same service request'
      );
      perform private.notify_request_administrators(request.id, 'admin_refund_requested');
      return true;
    end if;
    update public.service_requests set payment_status = 'paid' where id = request.id;
    select bool_or(status = 'confirmed' and kind = 'primary'), bool_or(status = 'proposed' and kind = 'primary')
    into has_confirmed, has_proposed
    from public.service_appointments where service_request_id = request.id;
    if request.status in ('awaiting_payment', 'payment_failed') then
      perform private.set_request_status(request.id,
        case when coalesce(has_confirmed, false) then 'appointment_confirmed'
             when coalesce(has_proposed, false) then 'appointment_proposed'
             else 'reschedule_requested' end,
        'payment_confirmed', jsonb_build_object('amount_cents', coalesce(input_amount_total_cents, payment.amount_total_cents)));
    else
      perform private.touch_request(request.id);
      perform private.record_request_event(request.id, 'payment_confirmed', request.status, request.status);
    end if;
    perform private.notify_request_household(request.id, 'payment_confirmed',
      jsonb_build_object('amount_cents', coalesce(input_amount_total_cents, payment.amount_total_cents)));
  elsif input_outcome = 'processing' then
    update public.service_payments
    set status = 'processing', provider_transaction_id = coalesce(input_payment_intent_id, provider_transaction_id),
        provider_updated_at = input_provider_updated_at, updated_at = now()
    where id = payment.id;
    update public.service_requests set payment_status = 'processing' where id = request.id;
    perform private.touch_request(request.id);
  else
    update public.service_payments
    set status = 'failed', failure_code = coalesce(input_failure_code, case when input_outcome = 'expired' then 'checkout_expired' else 'payment_failed' end),
        provider_transaction_id = coalesce(input_payment_intent_id, provider_transaction_id),
        provider_updated_at = input_provider_updated_at, updated_at = now()
    where id = payment.id;
    -- Only the latest attempt drives the request's payment state.
    if not exists (
      select 1 from public.service_payments
      where service_request_id = request.id and id <> payment.id and status in ('pending', 'processing', 'paid', 'partially_refunded', 'refunded')
    ) then
      if input_outcome = 'expired' then
        update public.service_requests set payment_status = 'unpaid' where id = request.id;
        perform private.touch_request(request.id);
      else
        update public.service_requests set payment_status = 'failed' where id = request.id;
        if request.status = 'awaiting_payment' then
          perform private.set_request_status(request.id, 'payment_failed', 'payment_failed',
            jsonb_build_object('failure_code', coalesce(input_failure_code, 'payment_failed')));
        else
          perform private.touch_request(request.id);
          perform private.record_request_event(request.id, 'payment_failed', request.status, request.status);
        end if;
        perform private.notify_request_household(request.id, 'payment_failed');
        perform private.notify_request_administrators(request.id, 'admin_payment_failed');
      end if;
    end if;
  end if;
  return true;
end;
$$;

create or replace function public.get_service_payment_for_sync(target_payment_id uuid)
returns table (payment_id uuid, service_request_id uuid, household_id uuid, provider_checkout_session_id text, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Payment operation is unavailable.' using errcode = '42501';
  end if;
  return query
  select payment.id, payment.service_request_id, payment.household_id, payment.provider_checkout_session_id, payment.status
  from public.service_payments as payment where payment.id = target_payment_id;
end;
$$;

-- 11. Refund processing --------------------------------------------------------

create or replace function public.admin_create_service_refund(target_payment_id uuid, input_amount_cents integer, input_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare payment public.service_payments%rowtype; created_id uuid;
begin
  perform private.require_administrator();
  select * into payment from public.service_payments where id = target_payment_id for update;
  if payment.id is null or payment.status not in ('paid', 'partially_refunded') then
    raise exception 'This payment cannot be refunded.' using errcode = '55000';
  end if;
  if input_amount_cents is null or input_amount_cents <= 0
    or input_amount_cents > payment.amount_total_cents - payment.refunded_amount_cents
      - coalesce((select sum(eligible_amount_cents) from public.service_refunds where payment_id = payment.id and status in ('requested', 'processing')), 0) then
    raise exception 'The refund amount exceeds the refundable balance.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(input_reason, ''))) < 2 then
    raise exception 'A refund reason is required.' using errcode = '22023';
  end if;
  insert into public.service_refunds (
    payment_id, service_request_id, household_id, customer_user_id, original_amount_cents,
    eligible_amount_cents, policy_tier, reason, requested_by
  ) values (
    payment.id, payment.service_request_id, payment.household_id, payment.payer_user_id,
    payment.amount_total_cents, input_amount_cents, 'admin_exception', left(btrim(input_reason), 1000), auth.uid()
  ) returning id into created_id;
  perform private.record_request_event(payment.service_request_id, 'refund_exception_created', null, null,
    jsonb_build_object('amount_cents', input_amount_cents));
  return created_id;
end;
$$;

create or replace function public.admin_reject_service_refund(target_refund_id uuid, input_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator();
  update public.service_refunds
  set status = 'rejected', processed_by = auth.uid(), processed_at = now(),
      reason = left(reason || ' | Rejected: ' || btrim(coalesce(input_reason, '')), 1000), updated_at = now()
  where id = target_refund_id and status in ('requested', 'failed');
  if not found then
    raise exception 'Refund is unavailable.' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.begin_service_refund(target_refund_id uuid, target_actor_id uuid, input_amount_cents integer)
returns table (refund_id uuid, provider_transaction_id text, refund_amount_cents integer, currency text)
language plpgsql
security definer
set search_path = ''
as $$
declare refund public.service_refunds%rowtype; payment public.service_payments%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' or not exists (
    select 1 from public.user_roles where user_id = target_actor_id and role = 'administrator'::public.app_role
  ) then
    raise exception 'Refund processing is unavailable.' using errcode = '42501';
  end if;
  select * into refund from public.service_refunds where id = target_refund_id for update;
  if refund.id is null or refund.status not in ('requested', 'failed') then
    raise exception 'Refund is unavailable.' using errcode = '55000';
  end if;
  select * into payment from public.service_payments where id = refund.payment_id for update;
  if input_amount_cents is null or input_amount_cents <= 0 or input_amount_cents > refund.eligible_amount_cents
    or input_amount_cents > payment.amount_total_cents - payment.refunded_amount_cents then
    raise exception 'The refund amount exceeds the policy-eligible amount.' using errcode = '22023';
  end if;
  if payment.provider_transaction_id is null then
    raise exception 'The payment has no provider transaction.' using errcode = '55000';
  end if;
  update public.service_refunds
  set status = 'processing', refund_amount_cents = input_amount_cents, processed_by = target_actor_id,
      failure_code = null, updated_at = now()
  where id = refund.id;
  return query select refund.id, payment.provider_transaction_id, input_amount_cents, payment.currency;
end;
$$;

create or replace function public.complete_service_refund(
  target_refund_id uuid,
  input_outcome text,
  input_provider_refund_id text default null,
  input_failure_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare refund public.service_refunds%rowtype; payment public.service_payments%rowtype; next_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' or input_outcome not in ('succeeded', 'failed')
    or (input_failure_code is not null and input_failure_code !~ '^[a-z0-9_]{1,80}$') then
    raise exception 'Refund processing is unavailable.' using errcode = '42501';
  end if;
  select * into refund from public.service_refunds where id = target_refund_id for update;
  if refund.id is null or refund.status <> 'processing' then
    raise exception 'Refund is unavailable.' using errcode = '55000';
  end if;
  if input_outcome = 'failed' then
    update public.service_refunds
    set status = 'failed', failure_code = coalesce(input_failure_code, 'refund_failed'),
        provider_refund_id = coalesce(input_provider_refund_id, provider_refund_id), updated_at = now()
    where id = refund.id;
    return;
  end if;
  select * into payment from public.service_payments where id = refund.payment_id for update;
  next_status := case when payment.refunded_amount_cents + refund.refund_amount_cents >= payment.amount_total_cents
    then 'refunded' else 'partially_refunded' end;
  update public.service_payments
  set refunded_amount_cents = refunded_amount_cents + refund.refund_amount_cents, status = next_status, updated_at = now()
  where id = payment.id;
  update public.service_refunds
  set status = 'succeeded', provider_refund_id = input_provider_refund_id, processed_at = now(), updated_at = now()
  where id = refund.id;
  if not exists (
    select 1 from public.service_payments
    where service_request_id = payment.service_request_id and id <> payment.id and status in ('paid', 'partially_refunded')
  ) then
    update public.service_requests set payment_status = next_status where id = payment.service_request_id;
  end if;
  update public.service_requests set version = version + 1, updated_at = now() where id = payment.service_request_id;
  insert into public.service_request_events (service_request_id, actor_id, actor_kind, action, safe_metadata)
  values (payment.service_request_id, refund.processed_by, 'administrator', 'refund_processed',
    jsonb_build_object('amount_cents', refund.refund_amount_cents, 'policy_tier', refund.policy_tier));
  perform private.notify_request_household(payment.service_request_id, 'refund_processed',
    jsonb_build_object('amount_cents', refund.refund_amount_cents));
end;
$$;

-- 12. Reads -------------------------------------------------------------------

create or replace function public.list_household_service_requests(input_status text default null, input_page integer default 1)
returns table (
  id uuid,
  service_type text,
  service_name text,
  dependent_name text,
  specialist_name text,
  status text,
  payment_status text,
  appointment_status text,
  follow_up_status text,
  delivery_method text,
  next_appointment_at timestamptz,
  amount_cents integer,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select request.id, request.service_type, service.name,
    coalesce(nullif(btrim(concat_ws(' ', dependent.first_name, dependent.last_name)), ''), 'Dependent'),
    case when request.specialist_id is not null then private.specialist_display_name(request.specialist_id) end,
    request.status, request.payment_status, request.appointment_status, request.follow_up_status,
    request.delivery_method,
    (select min(appointment.start_at) from public.service_appointments as appointment
      where appointment.service_request_id = request.id and appointment.status = 'confirmed' and appointment.end_at > now()),
    service.price_cents, request.created_at, request.updated_at,
    count(*) over ()
  from public.service_requests as request
  join public.services as service on service.id = request.service_id
  join public.dependents as dependent on dependent.id = request.dependent_id
  where request.household_id = private.current_household_id()
    and private.is_active_household_member(request.household_id)
    and (input_status is null
      or (input_status = 'active' and request.status not in ('completed', 'cancelled', 'declined'))
      or (input_status = 'closed' and request.status in ('completed', 'cancelled', 'declined'))
      or request.status = input_status)
  order by request.updated_at desc, request.id
  limit 20 offset (greatest(coalesce(input_page, 1), 1) - 1) * 20;
$$;

-- One projection serves household, specialist, and administrator detail views.
-- Capability flags are computed here so no audience logic runs in the browser.
create or replace function public.get_service_request_detail(target_request_id uuid)
returns table (
  id uuid,
  household_id uuid,
  household_name text,
  household_contact_phone text,
  household_contact_email text,
  requester_name text,
  dependent_id uuid,
  dependent_name text,
  dependent_service_needs text,
  dependent_communication text,
  dependent_preferred_language text,
  dependent_educational_information text,
  dependent_behavioral_information text,
  service_type text,
  service_name text,
  price_cents integer,
  duration_minutes integer,
  standard_instructions jsonb,
  specialist_id uuid,
  specialist_name text,
  description text,
  relevant_information text,
  consultation_category text,
  consultation_topic_key text,
  preferred_language text,
  iep_language text,
  iep_services text[],
  delivery_method text,
  preferred_location_type text,
  preferred_location_details text,
  requested_meeting_date date,
  status text,
  payment_status text,
  appointment_status text,
  follow_up_status text,
  availability_requested boolean,
  primary_session_completed_at timestamptz,
  late_reschedule_used boolean,
  refund_cap_percent integer,
  full_refund_eligible boolean,
  completed_at timestamptz,
  completion_notes text,
  cancelled_at timestamptz,
  cancellation_reason text,
  declined_reason text,
  version integer,
  created_at timestamptz,
  updated_at timestamptz,
  viewer_role text,
  can_pay boolean,
  can_confirm boolean,
  can_manage boolean,
  can_upload boolean,
  can_propose boolean,
  can_deliver boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer text;
begin
  if not private.can_read_service_request(target_request_id) then
    return;
  end if;
  viewer := case
    when private.is_current_user_administrator() then 'administrator'
    when private.is_request_specialist(target_request_id) then 'specialist'
    else 'household' end;
  return query
  select request.id, request.household_id, household.name,
    case when viewer <> 'household' then household.contact_phone end,
    case when viewer <> 'household' then household.contact_email end,
    private.display_name(request.requested_by),
    request.dependent_id,
    coalesce(nullif(btrim(concat_ws(' ', dependent.first_name, dependent.last_name)), ''), 'Dependent'),
    dependent.service_needs, dependent.communication_considerations, dependent.preferred_language,
    dependent.educational_information, dependent.behavioral_information,
    request.service_type, service.name, service.price_cents, service.duration_minutes, service.standard_instructions,
    request.specialist_id,
    case when request.specialist_id is not null then private.specialist_display_name(request.specialist_id) end,
    request.description, request.relevant_information, request.consultation_category, request.consultation_topic_key,
    request.preferred_language, request.iep_language, request.iep_services, request.delivery_method,
    request.preferred_location_type, request.preferred_location_details, request.requested_meeting_date,
    request.status, request.payment_status, request.appointment_status, request.follow_up_status,
    request.availability_requested_at is not null, request.primary_session_completed_at,
    request.late_reschedule_used, request.refund_cap_percent, request.full_refund_eligible,
    request.completed_at, request.completion_notes, request.cancelled_at, request.cancellation_reason,
    request.declined_reason, request.version, request.created_at, request.updated_at,
    viewer,
    viewer = 'household' and private.household_actor_can(request.household_id, 'make_payments')
      and request.status in ('awaiting_payment', 'payment_failed')
      and request.payment_status not in ('processing', 'paid', 'partially_refunded', 'refunded'),
    viewer = 'household' and private.household_actor_can(request.household_id, 'confirm_appointments'),
    viewer = 'household' and private.household_actor_can(request.household_id, 'submit_requests'),
    (viewer = 'household' and private.household_actor_can(request.household_id, 'upload_documents')) or viewer = 'specialist',
    viewer = 'administrator' or (viewer = 'specialist' and (request.availability_requested_at is not null or request.follow_up_status = 'requested')),
    viewer in ('administrator', 'specialist')
  from public.service_requests as request
  join public.households as household on household.id = request.household_id
  join public.services as service on service.id = request.service_id
  join public.dependents as dependent on dependent.id = request.dependent_id
  where request.id = target_request_id;
end;
$$;

create or replace function public.list_service_request_appointments(target_request_id uuid)
returns table (
  id uuid,
  kind text,
  proposal_group uuid,
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  delivery_method text,
  location_type text,
  location_details text,
  meeting_url text,
  instructions text,
  status text,
  customer_confirmed boolean,
  confirmed_at timestamptz,
  scheduled_directly boolean,
  proposed_by_role text,
  cancellation_kind text,
  cancellation_reason text,
  completed_at timestamptz,
  completion_notes text,
  specialist_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select appointment.id, appointment.kind, appointment.proposal_group, appointment.start_at, appointment.end_at,
    appointment.timezone, appointment.delivery_method, appointment.location_type, appointment.location_details,
    case when appointment.status = 'confirmed' then appointment.meeting_url end,
    appointment.instructions, appointment.status, appointment.customer_confirmed, appointment.confirmed_at,
    appointment.scheduled_directly, appointment.proposed_by_role, appointment.cancellation_kind,
    appointment.cancellation_reason, appointment.completed_at,
    case when not private.is_request_household_member(appointment.service_request_id) or private.is_current_user_administrator()
      then appointment.completion_notes end,
    private.specialist_display_name(appointment.specialist_id),
    appointment.created_at
  from public.service_appointments as appointment
  where appointment.service_request_id = target_request_id
    and private.can_read_service_request(target_request_id)
  order by appointment.created_at desc, appointment.start_at;
$$;

create or replace function public.list_service_request_timeline(target_request_id uuid)
returns table (
  id uuid,
  item_type text,
  action text,
  actor_kind text,
  actor_name text,
  body text,
  from_status text,
  to_status text,
  metadata jsonb,
  is_self boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select event.id, 'event'::text, event.action, event.actor_kind,
      case when event.actor_id is null then null else private.display_name(event.actor_id) end,
      null::text, event.from_status, event.to_status,
      case when private.is_current_user_administrator() then event.safe_metadata else event.safe_metadata - 'reason' end,
      event.actor_id = auth.uid(), event.created_at
    from public.service_request_events as event
    where event.service_request_id = target_request_id
    union all
    select message.id, 'message'::text, 'message', message.author_kind,
      case when message.author_id is null then null else private.display_name(message.author_id) end,
      message.body, null, null, '{}'::jsonb, message.author_id = auth.uid(), message.created_at
    from public.service_request_messages as message
    where message.service_request_id = target_request_id
  ) as items
  where private.can_read_service_request(target_request_id)
  order by 11, 1
  limit 500;
$$;

create or replace function public.list_service_request_payments(target_request_id uuid)
returns table (
  id uuid,
  status text,
  base_amount_cents integer,
  fee_amount_cents integer,
  accepted_fees jsonb,
  tax_amount_cents integer,
  amount_total_cents integer,
  refunded_amount_cents integer,
  failure_code text,
  paid_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select payment.id, payment.status, payment.base_amount_cents, payment.fee_amount_cents, payment.accepted_fees,
    payment.tax_amount_cents, payment.amount_total_cents, payment.refunded_amount_cents,
    payment.failure_code, payment.paid_at, payment.created_at
  from public.service_payments as payment
  where payment.service_request_id = target_request_id
    and (private.is_request_household_member(target_request_id) or private.is_current_user_administrator())
  order by payment.created_at desc;
$$;

create or replace function public.list_service_request_refunds(target_request_id uuid)
returns table (
  id uuid,
  payment_id uuid,
  status text,
  policy_tier text,
  reason text,
  original_amount_cents integer,
  eligible_amount_cents integer,
  refund_amount_cents integer,
  provider_refund_id text,
  processed_by_name text,
  processed_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select refund.id, refund.payment_id, refund.status, refund.policy_tier, refund.reason,
    refund.original_amount_cents, refund.eligible_amount_cents, refund.refund_amount_cents,
    case when private.is_current_user_administrator() then refund.provider_refund_id end,
    case when refund.processed_by is not null then private.display_name(refund.processed_by) end,
    refund.processed_at, refund.created_at
  from public.service_refunds as refund
  where refund.service_request_id = target_request_id
    and (private.is_request_household_member(target_request_id) or private.is_current_user_administrator())
  order by refund.created_at desc;
$$;

create or replace function public.list_upcoming_service_appointments(input_limit integer default 10)
returns table (
  appointment_id uuid,
  service_request_id uuid,
  service_type text,
  kind text,
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  delivery_method text,
  location_type text,
  dependent_name text,
  specialist_name text,
  household_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select appointment.id, appointment.service_request_id, request.service_type, appointment.kind,
    appointment.start_at, appointment.end_at, appointment.timezone, appointment.delivery_method,
    appointment.location_type,
    coalesce(nullif(btrim(concat_ws(' ', dependent.first_name, dependent.last_name)), ''), 'Dependent'),
    private.specialist_display_name(appointment.specialist_id),
    household.name
  from public.service_appointments as appointment
  join public.service_requests as request on request.id = appointment.service_request_id
  join public.dependents as dependent on dependent.id = request.dependent_id
  join public.households as household on household.id = request.household_id
  where appointment.status = 'confirmed'
    and appointment.end_at > now()
    and (
      (request.household_id = private.current_household_id() and private.is_active_household_member(request.household_id))
      or (appointment.specialist_id = private.current_specialist_profile_id() and private.is_request_specialist(request.id))
      or private.is_current_user_administrator()
    )
  order by appointment.start_at
  limit least(greatest(coalesce(input_limit, 10), 1), 50);
$$;

create or replace function public.list_specialist_service_requests(input_scope text default 'active', input_page integer default 1)
returns table (
  id uuid,
  service_type text,
  dependent_name text,
  household_name text,
  status text,
  follow_up_status text,
  delivery_method text,
  language text,
  availability_requested boolean,
  next_appointment_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select request.id, request.service_type,
    coalesce(nullif(btrim(concat_ws(' ', dependent.first_name, dependent.last_name)), ''), 'Dependent'),
    household.name, request.status, request.follow_up_status, request.delivery_method,
    case when request.service_type = 'iep_language_assistance' then request.iep_language else request.preferred_language end,
    request.availability_requested_at is not null,
    (select min(appointment.start_at) from public.service_appointments as appointment
      where appointment.service_request_id = request.id and appointment.status = 'confirmed' and appointment.end_at > now()),
    request.updated_at,
    count(*) over ()
  from public.service_requests as request
  join public.dependents as dependent on dependent.id = request.dependent_id
  join public.households as household on household.id = request.household_id
  where request.specialist_id = private.current_specialist_profile_id()
    and private.is_request_specialist(request.id)
    and (
      (coalesce(input_scope, 'active') = 'active' and request.status not in ('completed', 'cancelled', 'declined'))
      or (input_scope = 'closed' and request.status in ('completed', 'cancelled'))
      or input_scope = 'all'
    )
  order by (request.availability_requested_at is not null or request.follow_up_status = 'requested') desc,
    request.updated_at desc, request.id
  limit 20 offset (greatest(coalesce(input_page, 1), 1) - 1) * 20;
$$;

create or replace function public.admin_list_service_requests(
  input_queue text default 'all',
  input_service_type text default null,
  input_page integer default 1
)
returns table (
  id uuid,
  service_type text,
  household_name text,
  dependent_name text,
  specialist_name text,
  status text,
  payment_status text,
  appointment_status text,
  follow_up_status text,
  delivery_method text,
  language text,
  next_appointment_at timestamptz,
  open_refund_count bigint,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator();
  return query
  select request.id, request.service_type, household.name,
    coalesce(nullif(btrim(concat_ws(' ', dependent.first_name, dependent.last_name)), ''), 'Dependent'),
    case when request.specialist_id is not null then private.specialist_display_name(request.specialist_id) end,
    request.status, request.payment_status, request.appointment_status, request.follow_up_status,
    request.delivery_method,
    case when request.service_type = 'iep_language_assistance' then request.iep_language else request.preferred_language end,
    (select min(appointment.start_at) from public.service_appointments as appointment
      where appointment.service_request_id = request.id and appointment.status = 'confirmed' and appointment.end_at > now()),
    (select count(*) from public.service_refunds as refund where refund.service_request_id = request.id and refund.status in ('requested', 'failed')),
    request.created_at, request.updated_at,
    count(*) over ()
  from public.service_requests as request
  join public.households as household on household.id = request.household_id
  join public.dependents as dependent on dependent.id = request.dependent_id
  where (input_service_type is null or request.service_type = input_service_type)
    and case coalesce(input_queue, 'all')
      when 'all' then true
      when 'new' then request.status = 'pending_review'
      when 'unassigned' then request.specialist_id is null and request.status not in ('completed', 'cancelled', 'declined')
      when 'assigned' then request.status in ('assigned', 'awaiting_availability')
      when 'awaiting_payment' then request.status = 'awaiting_payment'
      when 'payment_failed' then request.status = 'payment_failed' or request.payment_status = 'failed'
      when 'proposed' then request.status = 'appointment_proposed'
      when 'upcoming' then request.status = 'appointment_confirmed'
      when 'in_progress' then request.status = 'in_progress'
      when 'follow_up' then request.follow_up_status = 'requested'
      when 'reschedule' then request.status = 'reschedule_requested'
      when 'cancelled' then request.status = 'cancelled'
      when 'no_show' then request.status = 'no_show'
      when 'completed' then request.status = 'completed'
      when 'declined' then request.status = 'declined'
      when 'refunds' then exists (select 1 from public.service_refunds as refund where refund.service_request_id = request.id and refund.status in ('requested', 'failed'))
      else false
    end
  order by request.updated_at desc, request.id
  limit 25 offset (greatest(coalesce(input_page, 1), 1) - 1) * 25;
end;
$$;

create or replace function public.admin_service_queue_counts()
returns table (queue text, item_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator();
  return query
  select 'new'::text, count(*) from public.service_requests where status = 'pending_review'
  union all select 'unassigned', count(*) from public.service_requests where specialist_id is null and status not in ('completed', 'cancelled', 'declined')
  union all select 'assigned', count(*) from public.service_requests where status in ('assigned', 'awaiting_availability')
  union all select 'awaiting_payment', count(*) from public.service_requests where status = 'awaiting_payment'
  union all select 'payment_failed', count(*) from public.service_requests where status = 'payment_failed' or payment_status = 'failed'
  union all select 'proposed', count(*) from public.service_requests where status = 'appointment_proposed'
  union all select 'upcoming', count(*) from public.service_requests where status = 'appointment_confirmed'
  union all select 'in_progress', count(*) from public.service_requests where status = 'in_progress'
  union all select 'follow_up', count(*) from public.service_requests where follow_up_status = 'requested'
  union all select 'reschedule', count(*) from public.service_requests where status = 'reschedule_requested'
  union all select 'cancelled', count(*) from public.service_requests where status = 'cancelled' and cancelled_at > now() - interval '30 days'
  union all select 'no_show', count(*) from public.service_requests where status = 'no_show'
  union all select 'completed', count(*) from public.service_requests where status = 'completed'
  union all select 'refunds', count(*) from public.service_refunds where status in ('requested', 'failed');
end;
$$;

create or replace function public.admin_list_service_payments(input_status text default null, input_page integer default 1)
returns table (
  id uuid,
  service_request_id uuid,
  service_type text,
  household_name text,
  payer_name text,
  status text,
  amount_total_cents integer,
  tax_amount_cents integer,
  refunded_amount_cents integer,
  failure_code text,
  provider_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator();
  return query
  select payment.id, payment.service_request_id, request.service_type, household.name,
    private.display_name(payment.payer_user_id), payment.status, payment.amount_total_cents,
    payment.tax_amount_cents, payment.refunded_amount_cents, payment.failure_code,
    payment.provider_transaction_id, payment.paid_at, payment.created_at,
    count(*) over ()
  from public.service_payments as payment
  join public.service_requests as request on request.id = payment.service_request_id
  join public.households as household on household.id = payment.household_id
  where input_status is null or payment.status = input_status
  order by payment.created_at desc, payment.id
  limit 25 offset (greatest(coalesce(input_page, 1), 1) - 1) * 25;
end;
$$;

create or replace function public.admin_list_service_refunds(input_status text default null, input_page integer default 1)
returns table (
  id uuid,
  payment_id uuid,
  service_request_id uuid,
  household_id uuid,
  household_name text,
  customer_name text,
  status text,
  policy_tier text,
  reason text,
  original_amount_cents integer,
  eligible_amount_cents integer,
  refund_amount_cents integer,
  provider_refund_id text,
  processed_by_name text,
  processed_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator();
  return query
  select refund.id, refund.payment_id, refund.service_request_id, refund.household_id, household.name,
    case when refund.customer_user_id is not null then private.display_name(refund.customer_user_id) end,
    refund.status, refund.policy_tier, refund.reason, refund.original_amount_cents, refund.eligible_amount_cents,
    refund.refund_amount_cents, refund.provider_refund_id,
    case when refund.processed_by is not null then private.display_name(refund.processed_by) end,
    refund.processed_at, refund.created_at,
    count(*) over ()
  from public.service_refunds as refund
  join public.households as household on household.id = refund.household_id
  where input_status is null or refund.status = input_status
    or (input_status = 'open' and refund.status in ('requested', 'failed'))
  order by (refund.status in ('requested', 'failed')) desc, refund.created_at desc, refund.id
  limit 25 offset (greatest(coalesce(input_page, 1), 1) - 1) * 25;
end;
$$;

create or replace function public.list_household_payment_history()
returns table (
  id uuid,
  service_request_id uuid,
  service_type text,
  status text,
  amount_total_cents integer,
  tax_amount_cents integer,
  refunded_amount_cents integer,
  paid_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select payment.id, payment.service_request_id, request.service_type, payment.status,
    payment.amount_total_cents, payment.tax_amount_cents, payment.refunded_amount_cents,
    payment.paid_at, payment.created_at
  from public.service_payments as payment
  join public.service_requests as request on request.id = payment.service_request_id
  where payment.household_id = private.current_household_id()
    and private.is_active_household_member(payment.household_id)
    and payment.status <> 'pending'
  order by payment.created_at desc
  limit 100;
$$;

-- Appointment reminders: the protected worker queues one reminder per confirmed
-- appointment starting within the next 24 hours.
create or replace function public.queue_service_appointment_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare appointment record; queued integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Reminder worker authorization is required.' using errcode = '42501';
  end if;
  for appointment in
    select id, service_request_id, start_at, kind
    from public.service_appointments
    where status = 'confirmed' and reminder_sent_at is null
      and start_at > now() and start_at <= now() + interval '24 hours'
    order by start_at
    limit 200
    for update skip locked
  loop
    update public.service_appointments set reminder_sent_at = now() where id = appointment.id;
    perform private.notify_request_household(appointment.service_request_id, 'appointment_reminder',
      jsonb_build_object('start_at', appointment.start_at, 'kind', appointment.kind));
    perform private.notify_request_specialist(appointment.service_request_id, 'specialist_appointment_reminder',
      jsonb_build_object('start_at', appointment.start_at, 'kind', appointment.kind));
    queued := queued + 1;
  end loop;
  -- Requests waiting more than 24 hours for assignment are escalated once per day.
  perform private.notify_request_administrators(request.id, 'admin_unassigned_request')
  from public.service_requests as request
  where request.status = 'pending_review'
    and request.created_at < now() - interval '24 hours'
    and not exists (
      select 1 from public.notifications as notification
      where notification.service_request_id = request.id
        and notification.notification_type = 'admin_unassigned_request'
        and notification.created_at > now() - interval '24 hours'
    );
  return queued;
end;
$$;

-- 13. Row-level security ------------------------------------------------------

alter table public.service_requests enable row level security;
alter table public.service_requests force row level security;
alter table public.service_appointments enable row level security;
alter table public.service_appointments force row level security;
alter table public.service_request_activities enable row level security;
alter table public.service_request_activities force row level security;
alter table public.service_request_messages enable row level security;
alter table public.service_request_messages force row level security;
alter table public.service_request_events enable row level security;
alter table public.service_request_events force row level security;
alter table public.service_payments enable row level security;
alter table public.service_payments force row level security;
alter table public.service_refunds enable row level security;
alter table public.service_refunds force row level security;

create policy service_requests_read on public.service_requests
  for select to authenticated using (private.can_read_service_request(id));
create policy service_appointments_read on public.service_appointments
  for select to authenticated using (private.can_read_service_request(service_request_id));
create policy service_request_activities_read on public.service_request_activities
  for select to authenticated using (private.can_read_service_request(service_request_id));
create policy service_request_messages_read on public.service_request_messages
  for select to authenticated using (private.can_read_service_request(service_request_id));
create policy service_request_events_read on public.service_request_events
  for select to authenticated using (private.can_read_service_request(service_request_id));
create policy service_payments_read on public.service_payments
  for select to authenticated
  using (private.is_active_household_member(household_id) or private.is_current_user_administrator());
create policy service_refunds_read on public.service_refunds
  for select to authenticated
  using (private.is_active_household_member(household_id) or private.is_current_user_administrator());

revoke all on public.service_requests, public.service_appointments, public.service_request_activities,
  public.service_request_messages, public.service_request_events, public.service_payments, public.service_refunds
  from public, anon, authenticated;
grant select on public.service_requests, public.service_appointments, public.service_request_activities,
  public.service_request_messages, public.service_request_events to authenticated;
-- Provider identifiers stay server-side; browsers read payment projections only.
grant select (id, household_id, service_request_id, base_amount_cents, fee_amount_cents, accepted_fees, subtotal_cents,
  tax_amount_cents, amount_total_cents, refunded_amount_cents, currency, payment_type, status, failure_code, paid_at, created_at, updated_at)
  on public.service_payments to authenticated;
grant select (id, payment_id, service_request_id, household_id, original_amount_cents, eligible_amount_cents,
  refund_amount_cents, policy_tier, reason, status, processed_at, created_at)
  on public.service_refunds to authenticated;
grant select on public.service_requests, public.service_appointments, public.service_payments, public.service_refunds to service_role;

create or replace function private.service_event_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Service history is immutable.' using errcode = '42501';
end;
$$;
create trigger service_request_events_immutable before update or delete on public.service_request_events
  for each row execute function private.service_event_immutable();
create trigger service_request_messages_immutable before update on public.service_request_messages
  for each row execute function private.service_event_immutable();
create trigger service_requests_set_updated_at before update on public.service_requests
  for each row execute function private.set_updated_at();

-- 14. Documents: request linkage and assigned-specialist access ------------

create or replace function private.document_service_request_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.service_request_id is distinct from old.service_request_id then
      raise exception 'A document cannot be moved between service requests.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.service_request_id is not null then
    if not exists (
      select 1 from public.service_requests as request
      where request.id = new.service_request_id
        and request.household_id = new.household_id
        and (new.dependent_id is null or request.dependent_id = new.dependent_id)
        and request.status not in ('cancelled', 'declined')
    ) then
      raise exception 'The document does not match the service request.' using errcode = '23514';
    end if;
    if not (
      private.household_actor_can(new.household_id, 'upload_documents')
      or private.is_request_specialist(new.service_request_id)
    ) then
      raise exception 'You cannot upload documents to this request.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists documents_service_request_link on public.documents;
create trigger documents_service_request_link
  before insert or update on public.documents
  for each row execute function private.document_service_request_link();

-- Notify the other side once an upload linked to a request completes.
create or replace function private.document_service_request_uploaded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.service_request_id is not null and old.upload_status = 'pending' and new.upload_status = 'uploaded' then
    if private.is_request_specialist(new.service_request_id) then
      perform private.notify_request_household(new.service_request_id, 'document_available');
    else
      perform private.notify_request_specialist(new.service_request_id, 'specialist_document_available');
    end if;
    perform private.touch_request(new.service_request_id);
  end if;
  return new;
end;
$$;
drop trigger if exists documents_service_request_uploaded on public.documents;
create trigger documents_service_request_uploaded
  after update on public.documents
  for each row execute function private.document_service_request_uploaded();

-- Reissue the document normalizer so an assigned specialist can finalize the
-- upload of a deliverable (for example a written translation) they prepared.
create or replace function private.normalize_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_filename text;
  has_processing_marker boolean;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Authentication is required to upload a document.' using errcode = '42501';
    end if;

    new.id := gen_random_uuid();
    new.title := btrim(coalesce(new.title, ''));
    new.document_type := nullif(btrim(new.document_type), '');
    safe_filename := private.normalize_document_filename(new.original_filename);

    if (new.mime_type = 'application/pdf' and safe_filename !~ E'\\.pdf$')
      or (new.mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and safe_filename !~ E'\\.docx$')
      or (new.mime_type = 'text/plain' and safe_filename !~ E'\\.txt$') then
      raise exception 'Document filename does not match its declared type.' using errcode = '22023';
    end if;

    if not private.document_dependent_matches_household(new.dependent_id, new.household_id) then
      raise exception 'The selected dependent is not available to this household.' using errcode = '23514';
    end if;

    new.original_filename := safe_filename;
    new.uploaded_by := auth.uid();
    new.storage_bucket := 'family-documents';
    new.upload_status := 'pending';
    new.processing_status := 'not_started';
    new.deleted_at := null;
    new.created_at := now();
    new.updated_at := now();
    new.storage_path := private.document_storage_path(
      new.household_id,
      new.dependent_id,
      new.id,
      new.original_filename
    );
  else
    if new.id is distinct from old.id
      or new.household_id is distinct from old.household_id
      or new.dependent_id is distinct from old.dependent_id
      or new.uploaded_by is distinct from old.uploaded_by
      or new.title is distinct from old.title
      or new.original_filename is distinct from old.original_filename
      or new.storage_bucket is distinct from old.storage_bucket
      or new.storage_path is distinct from old.storage_path
      or new.mime_type is distinct from old.mime_type
      or new.file_size is distinct from old.file_size
      or new.document_type is distinct from old.document_type
      or new.detected_language is distinct from old.detected_language
      or new.created_at is distinct from old.created_at then
      raise exception 'Document identity and metadata cannot be changed after upload preparation.' using errcode = '42501';
    end if;

    if old.upload_status = 'archived' then
      raise exception 'Archived documents cannot be changed.' using errcode = '42501';
    end if;

    if new.processing_status is distinct from old.processing_status then
      select exists (
        select 1
        from private.document_processing_transition_markers as marker
        where marker.document_id = old.id
          and marker.transaction_id = txid_current()
      ) into has_processing_marker;

      if not has_processing_marker
        or not private.document_processing_transition_is_valid(old.processing_status, new.processing_status) then
        raise exception 'Document processing status cannot be changed directly.' using errcode = '42501';
      end if;
    end if;

    if new.upload_status is distinct from old.upload_status then
      if new.upload_status in ('uploaded', 'failed')
        and (
          old.uploaded_by is distinct from auth.uid()
          or not (
            private.has_household_permission(
              old.household_id,
              array['owner', 'administrator', 'member']::public.household_permission[]
            )
            or (old.service_request_id is not null and private.is_request_specialist(old.service_request_id))
          )
        ) then
        raise exception 'Only the original active uploader can finalize an upload.' using errcode = '42501';
      end if;

      if not (
        (old.upload_status = 'pending' and new.upload_status in ('failed', 'archived'))
        or (
          old.upload_status = 'pending'
          and new.upload_status = 'uploaded'
          and private.document_storage_object_matches_metadata(
            old.storage_bucket,
            old.storage_path,
            old.file_size,
            old.mime_type
          )
        )
        or (old.upload_status in ('uploaded', 'failed') and new.upload_status = 'archived')
      ) then
        raise exception 'Invalid document upload status transition.' using errcode = '42501';
      end if;
    end if;

    if new.upload_status = 'archived' and old.upload_status <> 'archived' then
      new.deleted_at := now();
      update public.document_processing_jobs as job
      set
        status = 'cancelled',
        locked_at = null,
        locked_by = null,
        completed_at = coalesce(job.completed_at, now()),
        error_code = 'document_archived',
        error_message = 'Document processing was cancelled.',
        updated_at = now()
      where job.document_id = old.id and job.status in ('queued', 'processing');
    end if;

    if (new.upload_status = 'archived' and new.deleted_at is null)
      or (new.upload_status <> 'archived' and new.deleted_at is not null) then
      raise exception 'Document archive state is invalid.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.can_upload_family_document_object(
  target_bucket text,
  target_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.documents as document
    where document.storage_bucket = target_bucket
      and document.storage_path = target_name
      and document.upload_status = 'pending'
      and document.deleted_at is null
      and document.uploaded_by = auth.uid()
      and private.document_matches_storage_object(target_bucket, target_name)
      and (
        private.has_household_permission(
          document.household_id,
          array['owner', 'administrator', 'member']::public.household_permission[]
        )
        or (document.service_request_id is not null and private.is_request_specialist(document.service_request_id))
      )
  );
$$;

create or replace function private.can_read_family_document_object(
  target_bucket text,
  target_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.documents as document
    where document.storage_bucket = target_bucket
      and document.storage_path = target_name
      and document.deleted_at is null
      and private.document_matches_storage_object(target_bucket, target_name)
      and (
        (
          document.upload_status = 'uploaded'
          and (
            private.is_active_household_member(document.household_id)
            or (document.service_request_id is not null and private.is_request_specialist(document.service_request_id))
            or (document.service_request_id is not null and private.is_current_user_administrator())
          )
        )
        or (
          document.upload_status in ('pending', 'failed')
          and document.uploaded_by = auth.uid()
          and (
            private.has_household_permission(
              document.household_id,
              array['owner', 'administrator', 'member']::public.household_permission[]
            )
            or (document.service_request_id is not null and private.is_request_specialist(document.service_request_id))
          )
        )
      )
  );
$$;

drop policy if exists documents_select_request_staff on public.documents;
create policy documents_select_request_staff on public.documents
  for select to authenticated
  using (
    service_request_id is not null
    and deleted_at is null
    and (
      private.is_request_specialist(service_request_id)
      or private.is_current_user_administrator()
    )
    and (upload_status = 'uploaded' or uploaded_by = auth.uid())
  );
drop policy if exists documents_insert_request_specialist on public.documents;
create policy documents_insert_request_specialist on public.documents
  for insert to authenticated
  with check (
    service_request_id is not null
    and uploaded_by = auth.uid()
    and storage_bucket = 'family-documents'
    and upload_status = 'pending'
    and processing_status = 'not_started'
    and deleted_at is null
    and private.is_request_specialist(service_request_id)
  );
drop policy if exists documents_update_request_specialist_uploader on public.documents;
create policy documents_update_request_specialist_uploader on public.documents
  for update to authenticated
  using (
    deleted_at is null and service_request_id is not null and uploaded_by = auth.uid()
    and private.is_request_specialist(service_request_id)
  )
  with check (service_request_id is not null and private.is_request_specialist(service_request_id));

create or replace function public.list_service_request_documents(target_request_id uuid)
returns table (
  id uuid,
  title text,
  original_filename text,
  mime_type text,
  file_size bigint,
  document_type text,
  uploaded_by_name text,
  uploaded_by_staff boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select document.id, document.title, document.original_filename, document.mime_type, document.file_size,
    document.document_type, private.display_name(document.uploaded_by),
    not exists (
      select 1 from public.household_members as membership
      where membership.household_id = document.household_id and membership.user_id = document.uploaded_by
    ),
    document.created_at
  from public.documents as document
  where document.service_request_id = target_request_id
    and document.deleted_at is null
    and document.upload_status = 'uploaded'
    and private.can_read_service_request(target_request_id)
  order by document.created_at desc;
$$;

-- The existing administrator specialist directory now counts service requests.
create or replace function public.admin_list_specialists()
returns table (
  specialist_id uuid,
  user_id uuid,
  display_name text,
  email text,
  bio text,
  availability_status text,
  capabilities jsonb,
  active_request_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator();
  return query
  select specialist.id, specialist.user_id,
    coalesce(nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Ethiospectrum specialist'),
    lower(auth_user.email)::text,
    specialist.bio, specialist.availability_status,
    coalesce((
      select jsonb_agg(jsonb_build_object('service_type', capability.service_type, 'language', capability.language, 'delivery_method', capability.delivery_method)
        order by capability.service_type, capability.language, capability.delivery_method)
      from public.specialist_capabilities as capability where capability.specialist_id = specialist.id
    ), '[]'::jsonb),
    (select count(*) from public.service_requests as request
      where request.specialist_id = specialist.id and request.status not in ('completed', 'cancelled', 'declined'))
  from public.specialists as specialist
  join public.user_roles as role_row on role_row.user_id = specialist.user_id and role_row.role = 'specialist'::public.app_role
  left join public.profiles as profile on profile.id = specialist.user_id
  left join auth.users as auth_user on auth_user.id = specialist.user_id
  order by 3, specialist.id;
end;
$$;

-- 15. Grants --------------------------------------------------------------------

revoke all on function private.is_request_household_member(uuid) from public, anon;
revoke all on function private.is_request_specialist(uuid) from public, anon;
revoke all on function private.can_read_service_request(uuid) from public, anon;
grant execute on function private.is_request_household_member(uuid) to authenticated;
grant execute on function private.is_request_specialist(uuid) to authenticated;
grant execute on function private.can_read_service_request(uuid) to authenticated;

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'display_name', 'specialist_display_name', 'specialist_user_id', 'request_actor_kind',
        'record_request_event', 'set_request_status', 'touch_request', 'sync_request_appointment_status',
        'request_link', 'notify_request_household', 'notify_request_specialist', 'notify_request_administrators',
        'create_refund_request', 'lock_request_for_household', 'assert_version', 'assert_no_specialist_conflict',
        'lock_request_for_staff', 'specialist_matches_request', 'insert_service_appointment',
        'service_event_immutable', 'document_service_request_link', 'document_service_request_uploaded'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
  end loop;
end $$;

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature, p.proname
    from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'service_refund_policy', 'create_service_request', 'confirm_service_appointment',
        'request_other_appointment_times', 'request_service_reschedule', 'cancel_service_request',
        'request_service_follow_up', 'admin_list_matching_specialists', 'admin_assign_service_specialist',
        'admin_request_specialist_availability', 'propose_service_appointments', 'admin_schedule_service_appointment',
        'admin_modify_service_appointment', 'admin_cancel_service_appointment', 'admin_cancel_service_request',
        'admin_decline_service_request', 'admin_override_service_status', 'record_service_appointment_outcome',
        'update_service_activity', 'complete_service_request', 'add_service_request_message',
        'prepare_service_payment', 'admin_create_service_refund', 'admin_reject_service_refund',
        'list_household_service_requests', 'get_service_request_detail', 'list_service_request_appointments',
        'list_service_request_timeline', 'list_service_request_payments', 'list_service_request_refunds',
        'list_upcoming_service_appointments', 'list_specialist_service_requests', 'admin_list_service_requests',
        'admin_service_queue_counts', 'admin_list_service_payments', 'admin_list_service_refunds',
        'list_household_payment_history', 'list_service_request_documents', 'admin_list_specialists'
      )
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated', fn.signature);
  end loop;
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'attach_service_payment_session', 'sync_service_payment', 'get_service_payment_for_sync',
        'begin_service_refund', 'complete_service_refund', 'queue_service_appointment_reminders'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end $$;

-- Stripe events used by one-time service payments and refunds.
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
    'refund.updated'
  )
);
