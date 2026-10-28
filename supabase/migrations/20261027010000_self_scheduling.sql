-- Self-scheduled bookings and the free Parent Support service.
--
-- 1. Specialists get a weekly schedule (hours per weekday in their own time
--    zone) and a default meeting link. Open slots are generated from it,
--    minus confirmed appointments and slots held during checkout.
-- 2. A service can be self-scheduled: the family picks an open slot and the
--    booking is assigned to that slot's specialist. Consultation becomes
--    self-scheduled; IEP Language Assistance keeps administrator review.
--    Paid bookings hold the slot during Checkout and are confirmed when the
--    payment succeeds; an expired Checkout releases the slot.
-- 3. Parent Support: a free, self-scheduled 30-minute remote session offered
--    only by specialists with the parent_support capability. A household may
--    have a limited number of upcoming sessions (services.max_upcoming_per_household).

-- 1. Catalog and table shapes ---------------------------------------------------

alter table public.services drop constraint if exists services_service_type_check;
alter table public.services add constraint services_service_type_check
  check (service_type in ('rbt_bootcamp', 'consultation', 'iep_language_assistance', 'parent_support'));
alter table public.services drop constraint if exists services_payment_shape;
alter table public.services add constraint services_payment_shape check (
  (service_type = 'rbt_bootcamp' and payment_type = 'recurring_monthly' and duration_minutes is null)
  or (service_type <> 'rbt_bootcamp' and payment_type = 'one_time' and price_cents is not null and duration_minutes is not null)
);
alter table public.services
  add column self_scheduled boolean not null default false,
  add column max_upcoming_per_household integer
    check (max_upcoming_per_household is null or max_upcoming_per_household between 1 and 20);

update public.services set self_scheduled = true, version = version + 1, updated_at = now()
where service_type = 'consultation';

insert into public.services (
  service_type, name, description, localized, price_cents, payment_type,
  duration_minutes, included_follow_ups, standard_instructions, self_scheduled, max_upcoming_per_household
) values (
  'parent_support',
  'Parent Support',
  'A free one-on-one session for parents and caregivers: a space to talk through what your family is facing and find support and next steps.',
  '{"am": {"name": "የወላጅ ድጋፍ", "description": "ለወላጆች እና ለአሳዳጊዎች ነፃ የአንድ ለአንድ ክፍለ ጊዜ፦ ቤተሰብዎ ስለሚያጋጥመው ነገር የሚወያዩበት እና ድጋፍ እና ቀጣይ እርምጃዎችን የሚያገኙበት።"}, "es": {"name": "Apoyo para padres", "description": "Una sesión individual gratuita para padres y cuidadores: un espacio para hablar de lo que vive su familia y encontrar apoyo y próximos pasos."}}'::jsonb,
  0, 'one_time', 30, 0,
  '{"en": "Please join a few minutes before your session.", "am": "እባክዎ ከክፍለ ጊዜዎ ጥቂት ደቂቃዎች ቀደም ብለው ይቀላቀሉ።", "es": "Conéctese unos minutos antes de su sesión."}'::jsonb,
  true, 1
) on conflict (service_type) do nothing;

alter table public.specialist_capabilities drop constraint if exists specialist_capabilities_service_type_check;
alter table public.specialist_capabilities add constraint specialist_capabilities_service_type_check
  check (service_type in ('consultation', 'iep_language_assistance', 'parent_support'));

alter table public.service_requests drop constraint if exists service_requests_service_type_check;
alter table public.service_requests add constraint service_requests_service_type_check
  check (service_type in ('consultation', 'iep_language_assistance', 'parent_support'));
alter table public.service_requests drop constraint if exists service_requests_payment_status_check;
alter table public.service_requests add constraint service_requests_payment_status_check
  check (payment_status in ('unpaid', 'pending', 'processing', 'paid', 'failed', 'partially_refunded', 'refunded', 'not_required'));
alter table public.service_requests drop constraint if exists service_requests_shape;
alter table public.service_requests add constraint service_requests_shape check (
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
  or (
    service_type = 'parent_support'
    and consultation_category is null
    and iep_language is null
    and cardinality(iep_services) = 0
    and delivery_method = 'remote'
  )
);

-- A family's own booking: the slot it picked, held during checkout.
alter table public.service_appointments drop constraint if exists service_appointments_proposed_by_role_check;
alter table public.service_appointments add constraint service_appointments_proposed_by_role_check
  check (proposed_by_role in ('administrator', 'specialist', 'household'));
alter table public.service_appointments add column hold_expires_at timestamptz;
create index service_appointments_hold_idx on public.service_appointments (specialist_id, start_at)
  where status = 'proposed' and hold_expires_at is not null;

-- 2. Specialist schedules --------------------------------------------------------

alter table public.specialists
  add column schedule_timezone text not null default 'America/Chicago'
    check (char_length(schedule_timezone) between 1 and 64),
  add column default_meeting_url text
    check (default_meeting_url is null or (default_meeting_url ~ '^https://' and char_length(default_meeting_url) <= 2048));

create table public.specialist_weekly_hours (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references public.specialists(id) on delete cascade,
  -- 0 = Sunday ... 6 = Saturday, in the specialist's schedule_timezone.
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint specialist_weekly_hours_order check (end_time > start_time)
);
create index specialist_weekly_hours_specialist_idx on public.specialist_weekly_hours (specialist_id, weekday);

alter table public.specialist_weekly_hours enable row level security;
alter table public.specialist_weekly_hours force row level security;
create policy specialist_weekly_hours_read on public.specialist_weekly_hours
  for select to authenticated
  using (
    private.is_current_user_administrator()
    or specialist_id = private.current_specialist_profile_id()
  );
grant select on public.specialist_weekly_hours to authenticated;

-- 3. Conflicts include slots held during checkout -------------------------------------

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
      and (status = 'confirmed' or (status = 'proposed' and hold_expires_at > now()))
      and (ignored_appointment is null or id <> ignored_appointment)
      and tstzrange(start_at, end_at, '[)') && tstzrange(input_start, input_end, '[)')
  ) then
    raise exception 'The specialist already has an appointment at that time.' using errcode = 'ES409';
  end if;
end;
$$;

-- Specialists who may take self-scheduled bookings for a service.
create function private.bookable_specialist_ids(input_service_type text, input_language text default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select specialist.id
  from public.specialists as specialist
  join public.user_roles as role_row on role_row.user_id = specialist.user_id
    and role_row.role in ('specialist'::public.app_role, 'administrator'::public.app_role)
  where specialist.availability_status = 'available'
    and exists (
      select 1 from public.specialist_capabilities as capability
      where capability.specialist_id = specialist.id
        and capability.service_type = input_service_type
        and capability.delivery_method = 'remote'
        and (input_language is null or capability.language = input_language)
    );
$$;

-- Open slots: weekly hours, stepped every 30 minutes, at least two hours
-- ahead, minus confirmed appointments and live checkout holds.
create function private.open_service_slots(
  input_service_type text,
  input_language text,
  input_specialist uuid,
  input_from timestamptz,
  input_to timestamptz
)
returns table (specialist_id uuid, start_at timestamptz, end_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with service as (
    select make_interval(mins => duration_minutes) as length
    from public.services
    where service_type = input_service_type and active and self_scheduled
  ),
  eligible as (
    select specialist.id, specialist.schedule_timezone as tz
    from public.specialists as specialist
    where specialist.id in (select private.bookable_specialist_ids(input_service_type, input_language))
      and (input_specialist is null or specialist.id = input_specialist)
  ),
  days as (
    select eligible.id, eligible.tz, day::date as day
    from eligible,
      generate_series(
        (input_from at time zone eligible.tz)::date - 1,
        (input_to at time zone eligible.tz)::date,
        interval '1 day'
      ) as day
  ),
  windows as (
    select days.id, days.tz, days.day + hours.start_time as window_start, days.day + hours.end_time as window_end
    from days
    join public.specialist_weekly_hours as hours
      on hours.specialist_id = days.id and hours.weekday = extract(dow from days.day)
  ),
  candidates as (
    select windows.id, (local_start at time zone windows.tz) as slot_start, service.length
    from windows, service,
      generate_series(windows.window_start, windows.window_end - service.length, interval '30 minutes') as local_start
  )
  select distinct candidates.id, candidates.slot_start, candidates.slot_start + candidates.length
  from candidates
  where candidates.slot_start >= greatest(input_from, now() + interval '2 hours')
    and candidates.slot_start < input_to
    and not exists (
      select 1 from public.service_appointments as appointment
      where appointment.specialist_id = candidates.id
        and (appointment.status = 'confirmed' or (appointment.status = 'proposed' and appointment.hold_expires_at > now()))
        and tstzrange(appointment.start_at, appointment.end_at, '[)')
          && tstzrange(candidates.slot_start, candidates.slot_start + candidates.length, '[)')
    )
  order by 2, 1;
$$;

-- 4. What families see ---------------------------------------------------------------

-- Self-scheduled services that at least one specialist currently offers.
-- Safe for the public site: it reveals only service types.
create function public.offered_self_scheduled_services()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(service.service_type order by service.service_type), array[]::text[])
  from public.services as service
  where service.active and service.self_scheduled
    and exists (select 1 from private.bookable_specialist_ids(service.service_type));
$$;

create function public.list_bookable_specialists(input_service_type text)
returns table (specialist_id uuid, display_name text, bio text, languages text[])
language sql
stable
security definer
set search_path = ''
as $$
  select specialist.id,
    coalesce(nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Ethiospectrum specialist'),
    specialist.bio,
    coalesce((
      select array_agg(distinct capability.language order by capability.language)
      from public.specialist_capabilities as capability
      where capability.specialist_id = specialist.id
        and capability.service_type = input_service_type and capability.delivery_method = 'remote'
    ), array[]::text[])
  from public.specialists as specialist
  left join public.profiles as profile on profile.id = specialist.user_id
  where auth.uid() is not null
    and specialist.id in (select private.bookable_specialist_ids(input_service_type))
  order by 2, 1;
$$;

create function public.list_open_service_slots(
  input_service_type text,
  input_language text default null,
  input_specialist_id uuid default null,
  input_days integer default 21
)
returns table (specialist_id uuid, start_at timestamptz, end_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to see open times.' using errcode = '42501';
  end if;
  if input_language is not null and input_language not in ('en', 'am', 'es') then
    raise exception 'Invalid language.' using errcode = '22023';
  end if;
  return query
  select slot.specialist_id, slot.start_at, slot.end_at
  from private.open_service_slots(
    input_service_type, input_language, input_specialist_id,
    now(), now() + make_interval(days => least(greatest(coalesce(input_days, 21), 1), 60))
  ) as slot
  limit 600;
end;
$$;

-- 5. Booking a slot ---------------------------------------------------------------------

create function public.book_service_slot(
  input_service_type text,
  input_dependent_id uuid,
  input_description text,
  input_language text,
  input_specialist_id uuid,
  input_start_at timestamptz,
  input_timezone text,
  input_idempotency_key uuid,
  input_relevant_information text default null,
  input_consultation_category text default null,
  input_consultation_topic_key text default null
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
  target_specialist public.specialists%rowtype;
  existing_id uuid;
  created_id uuid;
  slot_end timestamptz;
  free_service boolean;
  upcoming integer;
begin
  if current_user_id is null or target_household is null
    or not private.household_actor_can(target_household, 'submit_requests') then
    raise exception 'You do not have permission to book services.' using errcode = '42501';
  end if;
  select id into existing_id from public.service_requests
  where requested_by = current_user_id and idempotency_key = input_idempotency_key;
  if existing_id is not null then return existing_id; end if;

  select * into target_service from public.services
  where service_type = input_service_type and active and self_scheduled;
  if target_service.id is null then
    raise exception 'This service cannot be booked online.' using errcode = '22023';
  end if;
  free_service := target_service.price_cents = 0;
  if input_language not in ('en', 'am', 'es')
    or input_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = input_timezone) then
    raise exception 'Choose a language and time zone.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.dependents
    where id = input_dependent_id and household_id = target_household and archived_at is null
  ) then
    raise exception 'Choose a dependent from your household.' using errcode = '22023';
  end if;
  if input_service_type = 'consultation' and (
    input_consultation_category not in ('general_guidance', 'behavioral_educational')
    or (input_consultation_topic_key is not null and not exists (
      select 1 from public.consultation_topics
      where topic_key = input_consultation_topic_key and active and category = input_consultation_category
    ))
  ) then
    raise exception 'Choose an available consultation topic.' using errcode = '22023';
  end if;
  if (select count(*) from public.service_requests
      where household_id = target_household and status not in ('completed', 'cancelled', 'declined')) >= 10 then
    raise exception 'Too many open service requests.' using errcode = '54000';
  end if;

  -- One booking at a time per specialist calendar.
  select * into target_specialist from public.specialists where id = input_specialist_id for update;
  if target_specialist.id is null then
    raise exception 'That time is no longer available.' using errcode = 'ES409';
  end if;

  if target_service.max_upcoming_per_household is not null then
    select count(*) into upcoming
    from public.service_requests as request
    join public.service_appointments as appointment
      on appointment.service_request_id = request.id and appointment.kind = 'primary'
    where request.household_id = target_household
      and request.service_type = input_service_type
      and request.status not in ('completed', 'cancelled', 'declined', 'no_show')
      and appointment.end_at > now()
      and (appointment.status = 'confirmed' or (appointment.status = 'proposed' and appointment.hold_expires_at > now()));
    if upcoming >= target_service.max_upcoming_per_household then
      raise exception 'You already have an upcoming session for this service.' using errcode = 'ES429';
    end if;
  end if;

  slot_end := input_start_at + make_interval(mins => target_service.duration_minutes);
  if not exists (
    select 1 from private.open_service_slots(input_service_type, input_language, input_specialist_id, input_start_at, slot_end)
    where start_at = input_start_at
  ) then
    raise exception 'That time is no longer available.' using errcode = 'ES409';
  end if;

  insert into public.service_requests (
    household_id, dependent_id, service_id, service_type, requested_by, specialist_id, description,
    relevant_information, consultation_category, consultation_topic_key, preferred_language,
    delivery_method, status, payment_status, idempotency_key
  ) values (
    target_household, input_dependent_id, target_service.id, input_service_type, current_user_id, input_specialist_id,
    btrim(coalesce(input_description, '')),
    nullif(btrim(coalesce(input_relevant_information, '')), ''),
    case when input_service_type = 'consultation' then input_consultation_category end,
    case when input_service_type = 'consultation' then nullif(input_consultation_topic_key, '') end,
    input_language, 'remote',
    case when free_service then 'appointment_confirmed' else 'awaiting_payment' end,
    case when free_service then 'not_required' else 'unpaid' end,
    input_idempotency_key
  ) returning id into created_id;

  insert into public.service_request_activities (service_request_id, activity_type)
  values (created_id, 'consultation_session');

  insert into public.service_appointments (
    service_request_id, household_id, specialist_id, kind, proposal_group, start_at, end_at, timezone,
    delivery_method, location_type, meeting_url, status, customer_confirmed, confirmed_by, confirmed_at,
    scheduled_directly, proposed_by, proposed_by_role, hold_expires_at
  ) values (
    created_id, target_household, input_specialist_id, 'primary', gen_random_uuid(), input_start_at, slot_end,
    input_timezone, 'remote', 'remote', target_specialist.default_meeting_url,
    case when free_service then 'confirmed' else 'proposed' end,
    true,
    case when free_service then current_user_id end,
    case when free_service then now() end,
    true, current_user_id, 'household',
    -- Stripe Checkout lasts at least 30 minutes; the hold covers it.
    case when free_service then null else now() + interval '35 minutes' end
  );

  perform private.record_request_event(created_id, 'self_scheduled', null,
    case when free_service then 'appointment_confirmed' else 'awaiting_payment' end,
    jsonb_build_object('start_at', input_start_at, 'specialist_id', input_specialist_id));
  perform private.sync_request_appointment_status(created_id);
  if free_service then
    perform private.notify_request_household(created_id, 'appointment_confirmed',
      jsonb_build_object('start_at', input_start_at, 'kind', 'primary', 'scheduled_directly', true));
    perform private.notify_request_specialist(created_id, 'specialist_appointment_confirmed',
      jsonb_build_object('start_at', input_start_at, 'kind', 'primary'));
    perform private.notify_request_administrators(created_id, 'admin_new_request');
  end if;
  return created_id;
end;
$$;

-- 6. Payment: re-hold on retry, confirm on success, release on expiry --------------------

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
  held public.service_appointments%rowtype;
  active_fee_ids uuid[];
  fee_snapshot jsonb;
  fee_total integer;
  created_id uuid;
  superseded text[];
begin
  request := private.lock_request_for_household(target_request_id, 'make_payments');
  if request.status not in ('awaiting_payment', 'payment_failed') or request.payment_status in ('processing', 'paid', 'partially_refunded', 'refunded', 'not_required') then
    raise exception 'This request is not awaiting payment.' using errcode = '55000';
  end if;
  select * into target_service from public.services where id = request.service_id;

  -- A family-booked slot is paid for while it is held; renew an expired hold
  -- if the time is still free. Requests scheduled by staff are unaffected.
  select * into held from public.service_appointments
  where service_request_id = request.id and kind = 'primary' and status = 'proposed' and proposed_by_role = 'household'
  order by created_at desc limit 1
  for update;
  if held.id is not null then
    if held.start_at < now() + interval '1 hour' then
      raise exception 'That time is no longer available.' using errcode = 'ES409';
    end if;
    if held.hold_expires_at is null or held.hold_expires_at <= now() then
      perform private.assert_no_specialist_conflict(held.specialist_id, held.start_at, held.end_at, held.id);
    end if;
    update public.service_appointments
    set hold_expires_at = now() + interval '35 minutes', updated_at = now()
    where id = held.id;
  end if;

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

-- Confirms the slot a self-scheduled booking held, once paid. Returns false
-- when the slot was lost (the hold lapsed and someone else took the time);
-- the caller then falls back to "reschedule requested" for staff to resolve.
create function private.confirm_held_booking(target_request uuid, payer uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare held public.service_appointments%rowtype;
begin
  select * into held from public.service_appointments
  where service_request_id = target_request and kind = 'primary' and status = 'proposed' and proposed_by_role = 'household'
  order by created_at desc limit 1
  for update;
  if held.id is null then
    return false;
  end if;
  begin
    perform private.assert_no_specialist_conflict(held.specialist_id, held.start_at, held.end_at, held.id);
  exception when sqlstate 'ES409' then
    return false;
  end;
  update public.service_appointments
  set status = 'confirmed', hold_expires_at = null, customer_confirmed = true,
      confirmed_by = payer, confirmed_at = now(), updated_at = now()
  where id = held.id;
  return true;
end;
$$;

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
  self_booked boolean;
  has_confirmed boolean;
  has_proposed boolean;
  other_paid boolean;
  booked_start timestamptz;
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
  -- Booked by the family from an open slot (rather than scheduled by staff).
  select exists (
    select 1 from public.service_appointments
    where service_request_id = request.id and proposed_by_role = 'household'
  ) into self_booked;

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
    if other_paid or request.status = 'cancelled' then
      -- A superseded checkout was completed after another succeeded, or the
      -- booking was already released: flag it for a full refund.
      insert into public.service_refunds (
        payment_id, service_request_id, household_id, customer_user_id, original_amount_cents,
        eligible_amount_cents, policy_tier, reason
      ) values (
        payment.id, payment.service_request_id, payment.household_id, payment.payer_user_id,
        coalesce(input_amount_total_cents, payment.amount_total_cents),
        coalesce(input_amount_total_cents, payment.amount_total_cents),
        'duplicate_payment',
        case when other_paid then 'Duplicate payment for the same service request'
             else 'Payment completed after the booking was released' end
      );
      perform private.notify_request_administrators(request.id, 'admin_refund_requested');
      return true;
    end if;
    update public.service_requests set payment_status = 'paid' where id = request.id;

    if self_booked and request.status in ('awaiting_payment', 'payment_failed')
      and private.confirm_held_booking(request.id, payment.payer_user_id) then
      select start_at into booked_start from public.service_appointments
      where service_request_id = request.id and kind = 'primary' and status = 'confirmed'
      order by confirmed_at desc limit 1;
      perform private.set_request_status(request.id, 'appointment_confirmed', 'payment_confirmed',
        jsonb_build_object('amount_cents', coalesce(input_amount_total_cents, payment.amount_total_cents), 'self_scheduled', true));
      perform private.sync_request_appointment_status(request.id);
      perform private.notify_request_household(request.id, 'appointment_confirmed',
        jsonb_build_object('start_at', booked_start, 'kind', 'primary', 'scheduled_directly', true));
      perform private.notify_request_specialist(request.id, 'specialist_appointment_confirmed',
        jsonb_build_object('start_at', booked_start, 'kind', 'primary'));
      perform private.notify_request_administrators(request.id, 'admin_new_request');
      return true;
    end if;

    select bool_or(status = 'confirmed' and kind = 'primary'), bool_or(status = 'proposed' and kind = 'primary' and proposed_by_role <> 'household')
    into has_confirmed, has_proposed
    from public.service_appointments where service_request_id = request.id;
    if request.status in ('awaiting_payment', 'payment_failed') then
      if self_booked then
        -- The held time was lost; staff schedule a new one.
        update public.service_appointments
        set status = 'superseded', hold_expires_at = null, updated_at = now()
        where service_request_id = request.id and status = 'proposed' and proposed_by_role = 'household';
        perform private.notify_request_administrators(request.id, 'admin_new_request');
      end if;
      perform private.set_request_status(request.id,
        case when coalesce(has_confirmed, false) then 'appointment_confirmed'
             when coalesce(has_proposed, false) then 'appointment_proposed'
             else 'reschedule_requested' end,
        'payment_confirmed', jsonb_build_object('amount_cents', coalesce(input_amount_total_cents, payment.amount_total_cents)));
      perform private.sync_request_appointment_status(request.id);
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
      if input_outcome = 'expired' and self_booked and request.status = 'awaiting_payment' then
        -- The family left Checkout: release the held time and close the booking.
        update public.service_appointments
        set status = 'cancelled', cancellation_kind = 'request_cancelled', cancellation_reason = 'Checkout expired',
            hold_expires_at = null, cancelled_at = now(), updated_at = now()
        where service_request_id = request.id and status = 'proposed';
        update public.service_requests
        set payment_status = 'unpaid', cancelled_at = now(), cancellation_reason = 'Checkout expired before payment'
        where id = request.id;
        perform private.set_request_status(request.id, 'cancelled', 'checkout_expired');
        perform private.sync_request_appointment_status(request.id);
      elsif input_outcome = 'expired' then
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

-- 7. Administration -------------------------------------------------------------------

create function public.admin_update_specialist_schedule(
  target_specialist_id uuid,
  input_timezone text,
  input_hours jsonb,
  input_meeting_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare entry jsonb;
begin
  perform private.require_administrator();
  if input_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = input_timezone)
    or jsonb_typeof(coalesce(input_hours, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(input_hours, '[]'::jsonb)) > 28
    or (nullif(btrim(coalesce(input_meeting_url, '')), '') is not null
        and (btrim(input_meeting_url) !~ '^https://' or char_length(btrim(input_meeting_url)) > 2048)) then
    raise exception 'Invalid schedule.' using errcode = '22023';
  end if;
  update public.specialists
  set schedule_timezone = input_timezone,
      default_meeting_url = nullif(btrim(coalesce(input_meeting_url, '')), ''),
      updated_at = now()
  where id = target_specialist_id;
  if not found then
    raise exception 'Specialist is unavailable.' using errcode = '42501';
  end if;
  delete from public.specialist_weekly_hours where specialist_id = target_specialist_id;
  for entry in select value from jsonb_array_elements(coalesce(input_hours, '[]'::jsonb)) loop
    begin
      insert into public.specialist_weekly_hours (specialist_id, weekday, start_time, end_time)
      values (target_specialist_id, (entry ->> 'weekday')::smallint, (entry ->> 'start')::time, (entry ->> 'end')::time);
    exception when others then
      raise exception 'Invalid schedule.' using errcode = '22023';
    end;
  end loop;
end;
$$;

create function public.admin_set_service_booking_limit(target_service_type text, input_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator();
  if input_limit is not null and input_limit not between 1 and 20 then
    raise exception 'Invalid limit.' using errcode = '22023';
  end if;
  update public.services
  set max_upcoming_per_household = input_limit, version = version + 1, updated_at = now()
  where service_type = target_service_type and self_scheduled;
  if not found then
    raise exception 'Service is unavailable.' using errcode = '22023';
  end if;
end;
$$;

create function public.admin_list_specialist_schedules()
returns table (specialist_id uuid, schedule_timezone text, default_meeting_url text, hours jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator();
  return query
  select specialist.id, specialist.schedule_timezone, specialist.default_meeting_url,
    coalesce((
      select jsonb_agg(jsonb_build_object('weekday', weekly.weekday,
        'start', to_char(weekly.start_time, 'HH24:MI'), 'end', to_char(weekly.end_time, 'HH24:MI'))
        order by weekly.weekday, weekly.start_time)
      from public.specialist_weekly_hours as weekly where weekly.specialist_id = specialist.id
    ), '[]'::jsonb)
  from public.specialists as specialist;
end;
$$;

-- 8. Grants ---------------------------------------------------------------------------

revoke all on function private.bookable_specialist_ids(text, text) from public, anon, authenticated;
revoke all on function private.open_service_slots(text, text, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.confirm_held_booking(uuid, uuid) from public, anon, authenticated;
revoke all on function public.offered_self_scheduled_services() from public;
grant execute on function public.offered_self_scheduled_services() to anon, authenticated;
revoke all on function public.list_bookable_specialists(text) from public, anon;
grant execute on function public.list_bookable_specialists(text) to authenticated;
revoke all on function public.list_open_service_slots(text, text, uuid, integer) from public, anon;
grant execute on function public.list_open_service_slots(text, text, uuid, integer) to authenticated;
revoke all on function public.book_service_slot(text, uuid, text, text, uuid, timestamptz, text, uuid, text, text, text) from public, anon;
grant execute on function public.book_service_slot(text, uuid, text, text, uuid, timestamptz, text, uuid, text, text, text) to authenticated;
revoke all on function public.admin_update_specialist_schedule(uuid, text, jsonb, text) from public, anon;
grant execute on function public.admin_update_specialist_schedule(uuid, text, jsonb, text) to authenticated;
revoke all on function public.admin_set_service_booking_limit(text, integer) from public, anon;
grant execute on function public.admin_set_service_booking_limit(text, integer) to authenticated;
revoke all on function public.admin_list_specialist_schedules() from public, anon;
grant execute on function public.admin_list_specialist_schedules() to authenticated;
