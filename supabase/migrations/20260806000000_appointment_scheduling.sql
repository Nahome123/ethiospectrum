-- ETH-027: request-level appointment scheduling.
--
-- The foundation shipped a dormant appointments table whose only policy read
-- can_access_household(), which authorizes dormant household-wide specialist
-- assignments. That is exactly the boundary ETH-025 and ETH-026 removed, so
-- ETH-027 replaces it: an appointment belongs to one support request, and
-- specialist access derives solely from that request's current
-- support_threads.specialist_id assignment, re-read on every query.
--
-- The assigned specialist proposes a time; the household consents. Neither
-- side can act alone, and a terminal request or revoked assignment cancels any
-- live appointment inside the same trusted transaction.

-- 1. Extend the existing appointments table into the ETH-027 record.

alter table public.appointments
  add column if not exists support_thread_id uuid references public.support_threads(id) on delete cascade,
  add column if not exists proposed_by uuid references auth.users(id) on delete restrict,
  add column if not exists proposed_local_datetime timestamp,
  add column if not exists timezone text,
  add column if not exists duration_minutes integer,
  add column if not exists modality text,
  add column if not exists version integer not null default 1,
  add column if not exists consented_by uuid references auth.users(id) on delete set null,
  add column if not exists consented_at timestamptz,
  add column if not exists consent_copy_version text,
  add column if not exists declined_by uuid references auth.users(id) on delete set null,
  add column if not exists declined_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists completed_by uuid references auth.users(id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists supersedes_appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists idempotency_key uuid;

-- The table is dormant groundwork; any pre-ETH-027 row is retired fail-safe
-- rather than treated as a consented appointment.
update public.appointments
set status = 'cancelled',
    cancellation_reason = coalesce(cancellation_reason, 'household_cancelled')
where status not in ('proposed', 'scheduled', 'declined', 'cancelled', 'completed')
   or support_thread_id is null;

alter table public.appointments
  drop constraint if exists appointments_status_check,
  drop constraint if exists appointments_check,
  drop constraint if exists appointments_duration_valid,
  drop constraint if exists appointments_modality_valid,
  drop constraint if exists appointments_timezone_present,
  drop constraint if exists appointments_version_valid,
  drop constraint if exists appointments_lifecycle_valid,
  drop constraint if exists appointments_modality_url_valid,
  drop constraint if exists appointments_cancellation_reason_valid;

alter table public.appointments
  add constraint appointments_status_check check (
    status in ('proposed', 'scheduled', 'declined', 'cancelled', 'completed')
  ),
  add constraint appointments_check check (end_time > start_time),
  add constraint appointments_duration_valid check (
    duration_minutes is null or duration_minutes in (30, 45, 60)
  ),
  add constraint appointments_modality_valid check (modality is null or modality in ('video', 'phone')),
  add constraint appointments_version_valid check (version >= 1),
  -- A phone appointment never stores a URL; a video appointment must carry an
  -- HTTPS one before the household can be asked to consent.
  add constraint appointments_modality_url_valid check (
    modality is null
    or (modality = 'phone' and meeting_url is null)
    or (
      modality = 'video'
      and meeting_url is not null
      and meeting_url ~ '^https://'
      and char_length(meeting_url) between 12 and 2000
    )
  ),
  add constraint appointments_cancellation_reason_valid check (
    cancellation_reason is null
    or cancellation_reason in (
      'household_cancelled', 'specialist_cancelled', 'reschedule_requested',
      'assignment_revoked', 'request_closed', 'request_cancelled'
    )
  ),
  add constraint appointments_lifecycle_valid check (
    (status = 'proposed'
      and consented_at is null and declined_at is null and cancelled_at is null and completed_at is null)
    or (status = 'scheduled'
      and consented_by is not null and consented_at is not null and consent_copy_version is not null
      and declined_at is null and cancelled_at is null and completed_at is null)
    or (status = 'declined'
      and declined_by is not null and declined_at is not null
      and cancelled_at is null and completed_at is null)
    or (status = 'cancelled'
      and cancelled_at is not null and cancellation_reason is not null
      and completed_at is null)
    or (status = 'completed'
      and completed_by is not null and completed_at is not null
      and consented_at is not null and cancelled_at is null)
  );

-- Exactly one live appointment per support request.
create unique index if not exists appointments_one_active_per_request_idx
  on public.appointments (support_thread_id)
  where status in ('proposed', 'scheduled');
create unique index if not exists appointments_creation_idempotency_idx
  on public.appointments (support_thread_id, proposed_by, idempotency_key);
create index if not exists appointments_thread_idx
  on public.appointments (support_thread_id, created_at desc, id);
create index if not exists appointments_specialist_live_idx
  on public.appointments (specialist_id, start_time)
  where status in ('proposed', 'scheduled');
create index if not exists appointments_household_live_idx
  on public.appointments (household_id, start_time)
  where status in ('proposed', 'scheduled');

-- 2. Immutable appointment audit history.

create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  support_thread_id uuid not null references public.support_threads(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('proposed', 'accepted', 'declined', 'cancelled', 'completed')),
  reason text check (
    reason is null
    or reason in (
      'household_cancelled', 'specialist_cancelled', 'reschedule_requested',
      'assignment_revoked', 'request_closed', 'request_cancelled'
    )
  ),
  appointment_version integer not null check (appointment_version >= 1),
  safe_metadata jsonb check (safe_metadata is null or pg_column_size(safe_metadata) <= 512),
  created_at timestamptz not null default now()
);

create index if not exists appointment_events_appointment_idx
  on public.appointment_events (appointment_id, created_at, id);
create index if not exists appointment_events_thread_idx
  on public.appointment_events (support_thread_id, created_at desc);

-- 3. A private transaction marker keeps appointment rows unwritable outside the
-- reviewed controlled functions, even for an elevated connection.

create table if not exists private.appointment_markers (
  appointment_id uuid not null,
  transaction_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (appointment_id, transaction_id)
);

create or replace function private.has_appointment_marker(target_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.appointment_markers as marker
    where marker.appointment_id = target_appointment_id
      and marker.transaction_id = txid_current()
  );
$$;

create or replace function private.appointment_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_appointment_marker(coalesce(new.id, old.id)) then
    raise exception 'Appointment changes are controlled.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.support_thread_id is distinct from old.support_thread_id
      or new.household_id is distinct from old.household_id
      or new.proposed_by is distinct from old.proposed_by
      or new.idempotency_key is distinct from old.idempotency_key
      or new.created_at is distinct from old.created_at then
      raise exception 'Appointment identity is immutable.' using errcode = '42501';
    end if;
    if old.status in ('declined', 'cancelled', 'completed') then
      raise exception 'This appointment is already final.' using errcode = '55000';
    end if;
    -- An accepted appointment's agreed terms never change in place; a different
    -- time requires cancelling and proposing again.
    if old.status = 'scheduled' and (
      new.start_time is distinct from old.start_time
      or new.timezone is distinct from old.timezone
      or new.duration_minutes is distinct from old.duration_minutes
      or new.modality is distinct from old.modality
    ) then
      raise exception 'A scheduled appointment cannot be modified in place.' using errcode = '42501';
    end if;
    if new.version not in (old.version, old.version + 1) then
      raise exception 'Appointment version is controlled.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_validate_integrity on public.appointments;
create trigger appointments_validate_integrity
  before insert or update on public.appointments
  for each row execute function private.appointment_integrity();

create or replace function private.appointment_event_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Appointment events are immutable.' using errcode = '42501';
end;
$$;

drop trigger if exists appointment_events_immutable on public.appointment_events;
create trigger appointment_events_immutable
  before update on public.appointment_events
  for each row execute function private.appointment_event_immutable();

-- 4. Timezone and daylight-saving resolution. Ambiguous and nonexistent local
-- times are rejected rather than silently resolved, matching ETH-022.

create or replace function private.resolve_appointment_instant(
  local_datetime timestamp,
  zone text
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved timestamptz;
begin
  if zone is null or not exists (select 1 from pg_timezone_names where name = zone) then
    raise exception 'The appointment timezone is invalid.' using errcode = '22023';
  end if;
  resolved := local_datetime at time zone zone;
  -- Spring-forward: the local time never occurs, so Postgres normalizes it.
  if (resolved at time zone zone) is distinct from local_datetime then
    raise exception 'That local time does not exist in the selected timezone.' using errcode = '22007';
  end if;
  -- Fall-back: a second instant renders as the same local time.
  if ((resolved - interval '1 hour') at time zone zone) = local_datetime
    or ((resolved + interval '1 hour') at time zone zone) = local_datetime then
    raise exception 'That local time is ambiguous in the selected timezone.' using errcode = '22008';
  end if;
  return resolved;
end;
$$;

-- 5. Request-level authorization. Deliberately never household-wide.

create or replace function private.appointment_household_reader(target_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.appointments as appointment
    where appointment.id = target_appointment_id
      and private.is_active_household_member(appointment.household_id)
  );
$$;

create or replace function private.appointment_assigned_specialist(target_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments as appointment
    join public.support_threads as thread on thread.id = appointment.support_thread_id
    where appointment.id = target_appointment_id
      and thread.status = 'open'
      and thread.specialist_id is not null
      and thread.specialist_id = appointment.specialist_id
      and private.is_assigned_open_request_specialist(thread.id)
  );
$$;

-- 6. RLS: replace the unsafe foundation policy.

alter table public.appointments enable row level security;
alter table public.appointments force row level security;
alter table public.appointment_events enable row level security;
alter table public.appointment_events force row level security;

drop policy if exists appointments_access on public.appointments;
drop policy if exists appointments_request_read on public.appointments;
drop policy if exists appointment_events_request_read on public.appointment_events;

create policy appointments_request_read
  on public.appointments
  for select to authenticated
  using (
    private.appointment_household_reader(id)
    or private.appointment_assigned_specialist(id)
    or private.is_current_user_administrator()
  );

create policy appointment_events_request_read
  on public.appointment_events
  for select to authenticated
  using (
    private.is_active_household_member(household_id)
    or private.is_assigned_open_request_specialist(support_thread_id)
    or private.is_current_user_administrator()
  );

revoke all on table public.appointments, public.appointment_events from anon;
revoke all on table public.appointments, public.appointment_events from authenticated;
grant select on table public.appointments, public.appointment_events to authenticated;

-- 7. Controlled operations.

create or replace function private.record_appointment_event(
  appointment public.appointments,
  actor uuid,
  event_action text,
  event_reason text default null,
  metadata jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.appointment_events (
    appointment_id, support_thread_id, household_id, actor_user_id,
    action, reason, appointment_version, safe_metadata
  ) values (
    appointment.id, appointment.support_thread_id, appointment.household_id, actor,
    event_action, event_reason, appointment.version, metadata
  );
$$;

create or replace function public.propose_support_appointment(
  target_thread_id uuid,
  input_local_datetime timestamp,
  input_timezone text,
  input_duration_minutes integer,
  input_modality text,
  input_meeting_url text,
  input_idempotency_key uuid,
  input_supersedes_appointment_id uuid default null
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_specialist_id uuid;
  existing_thread public.support_threads%rowtype;
  existing_appointment public.appointments%rowtype;
  normalized_url text := nullif(btrim(coalesce(input_meeting_url, '')), '');
  resolved_start timestamptz;
  resolved_end timestamptz;
  created_id uuid;
  created_row public.appointments%rowtype;
begin
  current_specialist_id := private.current_specialist_profile_id();
  if current_specialist_id is null then
    raise exception 'Appointment proposals are unavailable.' using errcode = '42501';
  end if;

  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = target_thread_id
  for update;
  if not found or existing_thread.specialist_id is distinct from current_specialist_id then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;
  if existing_thread.status <> 'open' then
    raise exception 'A closed or cancelled support request cannot be scheduled.' using errcode = '55000';
  end if;
  if input_idempotency_key is null then
    raise exception 'Appointment creation key is required.' using errcode = '22023';
  end if;

  select appointment.* into existing_appointment
  from public.appointments as appointment
  where appointment.support_thread_id = existing_thread.id
    and appointment.proposed_by = current_user_id
    and appointment.idempotency_key = input_idempotency_key;
  if found then
    return query select existing_appointment.id, existing_appointment.version;
    return;
  end if;

  if input_duration_minutes not in (30, 45, 60) then
    raise exception 'The appointment duration is invalid.' using errcode = '22023';
  end if;
  if input_modality not in ('video', 'phone') then
    raise exception 'The appointment meeting method is invalid.' using errcode = '22023';
  end if;
  if input_modality = 'video' and (normalized_url is null or normalized_url !~ '^https://'
    or char_length(normalized_url) not between 12 and 2000) then
    raise exception 'A secure HTTPS meeting link is required.' using errcode = '22023';
  end if;
  if input_modality = 'phone' and normalized_url is not null then
    raise exception 'A phone appointment cannot include a meeting link.' using errcode = '22023';
  end if;

  resolved_start := private.resolve_appointment_instant(input_local_datetime, input_timezone);
  resolved_end := resolved_start + make_interval(mins => input_duration_minutes);
  if resolved_start < now() + interval '24 hours' then
    raise exception 'An appointment must start at least 24 hours from now.' using errcode = '22023';
  end if;
  if resolved_start > now() + interval '90 days' then
    raise exception 'An appointment must start within 90 days.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.appointments as live
    where live.support_thread_id = existing_thread.id
      and live.status in ('proposed', 'scheduled')
  ) then
    raise exception 'This support request already has an active appointment.' using errcode = '23505';
  end if;

  -- Serialize overlap checks for this specialist and household.
  perform pg_advisory_xact_lock(hashtextextended(current_specialist_id::text, 27027));
  perform pg_advisory_xact_lock(hashtextextended(existing_thread.household_id::text, 27028));

  -- Half-open intervals: back-to-back appointments do not overlap.
  if exists (
    select 1 from public.appointments as live
    where live.status in ('proposed', 'scheduled')
      and (live.specialist_id = current_specialist_id or live.household_id = existing_thread.household_id)
      and live.start_time < resolved_end
      and live.end_time > resolved_start
  ) then
    raise exception 'That time conflicts with another appointment.' using errcode = '23P01';
  end if;

  -- The identifier is generated first so the controlled-write marker can cover
  -- the insert itself.
  created_id := gen_random_uuid();
  insert into private.appointment_markers (appointment_id, transaction_id)
  values (created_id, txid_current()) on conflict do nothing;

  insert into public.appointments (
    id, support_thread_id, household_id, specialist_id, proposed_by,
    proposed_local_datetime, timezone, start_time, end_time, duration_minutes,
    modality, meeting_url, status, version, supersedes_appointment_id, idempotency_key
  ) values (
    created_id, existing_thread.id, existing_thread.household_id, current_specialist_id, current_user_id,
    input_local_datetime, input_timezone, resolved_start, resolved_end, input_duration_minutes,
    input_modality, normalized_url, 'proposed', 1, input_supersedes_appointment_id, input_idempotency_key
  );

  delete from private.appointment_markers as marker
  where marker.appointment_id = created_id and marker.transaction_id = txid_current();

  select * into created_row from public.appointments where public.appointments.id = created_id;
  perform private.record_appointment_event(
    created_row, current_user_id, 'proposed', null,
    jsonb_build_object('modality', input_modality, 'duration_minutes', input_duration_minutes)
  );

  return query select created_id, 1;
end;
$$;

create or replace function public.accept_support_appointment(
  target_appointment_id uuid,
  expected_version integer,
  input_consent_copy_version text,
  input_acknowledged boolean
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_permission public.household_permission;
  existing_appointment public.appointments%rowtype;
  existing_thread public.support_threads%rowtype;
  next_version integer;
  updated_row public.appointments%rowtype;
begin
  select appointment.* into existing_appointment
  from public.appointments as appointment
  where appointment.id = target_appointment_id
  for update;
  if not found then
    raise exception 'This appointment is unavailable.' using errcode = '42501';
  end if;

  current_permission := private.current_support_permission(existing_appointment.household_id);
  if current_permission is null or current_permission = 'viewer' then
    raise exception 'This appointment action is unavailable.' using errcode = '42501';
  end if;
  if coalesce(input_acknowledged, false) is distinct from true then
    raise exception 'Appointment consent must be acknowledged.' using errcode = '22023';
  end if;
  if input_consent_copy_version is null or char_length(btrim(input_consent_copy_version)) = 0 then
    raise exception 'Appointment consent version is required.' using errcode = '22023';
  end if;
  if existing_appointment.status <> 'proposed' then
    raise exception 'This appointment can no longer be accepted.' using errcode = '55000';
  end if;
  if expected_version is null or existing_appointment.version is distinct from expected_version then
    raise exception 'This appointment was updated elsewhere.' using errcode = '40001';
  end if;

  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = existing_appointment.support_thread_id;
  if not found or existing_thread.status <> 'open'
    or existing_thread.specialist_id is distinct from existing_appointment.specialist_id then
    raise exception 'This appointment is no longer available.' using errcode = '55000';
  end if;
  if existing_appointment.start_time <= now() then
    raise exception 'This appointment time has already passed.' using errcode = '22023';
  end if;

  next_version := existing_appointment.version + 1;
  insert into private.appointment_markers (appointment_id, transaction_id)
  values (existing_appointment.id, txid_current()) on conflict do nothing;

  update public.appointments as appointment
  set status = 'scheduled',
      version = next_version,
      consented_by = current_user_id,
      consented_at = now(),
      consent_copy_version = btrim(input_consent_copy_version)
  where appointment.id = existing_appointment.id;

  delete from private.appointment_markers as marker
  where marker.appointment_id = existing_appointment.id and marker.transaction_id = txid_current();

  select * into updated_row from public.appointments where public.appointments.id = existing_appointment.id;
  perform private.record_appointment_event(
    updated_row, current_user_id, 'accepted', null,
    jsonb_build_object('consent_copy_version', btrim(input_consent_copy_version))
  );

  return query select existing_appointment.id, next_version;
end;
$$;

create or replace function public.decline_support_appointment(
  target_appointment_id uuid,
  expected_version integer
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_permission public.household_permission;
  existing_appointment public.appointments%rowtype;
  next_version integer;
  updated_row public.appointments%rowtype;
begin
  select appointment.* into existing_appointment
  from public.appointments as appointment
  where appointment.id = target_appointment_id
  for update;
  if not found then
    raise exception 'This appointment is unavailable.' using errcode = '42501';
  end if;
  current_permission := private.current_support_permission(existing_appointment.household_id);
  if current_permission is null or current_permission = 'viewer' then
    raise exception 'This appointment action is unavailable.' using errcode = '42501';
  end if;
  if existing_appointment.status <> 'proposed' then
    raise exception 'This appointment can no longer be declined.' using errcode = '55000';
  end if;
  if expected_version is null or existing_appointment.version is distinct from expected_version then
    raise exception 'This appointment was updated elsewhere.' using errcode = '40001';
  end if;

  next_version := existing_appointment.version + 1;
  insert into private.appointment_markers (appointment_id, transaction_id)
  values (existing_appointment.id, txid_current()) on conflict do nothing;
  update public.appointments as appointment
  set status = 'declined', version = next_version, declined_by = current_user_id, declined_at = now()
  where appointment.id = existing_appointment.id;
  delete from private.appointment_markers as marker
  where marker.appointment_id = existing_appointment.id and marker.transaction_id = txid_current();

  select * into updated_row from public.appointments where public.appointments.id = existing_appointment.id;
  perform private.record_appointment_event(updated_row, current_user_id, 'declined');
  return query select existing_appointment.id, next_version;
end;
$$;

create or replace function private.cancel_appointment_row(
  existing_appointment public.appointments,
  actor uuid,
  reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer := existing_appointment.version + 1;
  updated_row public.appointments%rowtype;
begin
  insert into private.appointment_markers (appointment_id, transaction_id)
  values (existing_appointment.id, txid_current()) on conflict do nothing;
  update public.appointments as appointment
  set status = 'cancelled', version = next_version, cancelled_by = actor,
      cancelled_at = now(), cancellation_reason = reason
  where appointment.id = existing_appointment.id;
  delete from private.appointment_markers as marker
  where marker.appointment_id = existing_appointment.id and marker.transaction_id = txid_current();

  select * into updated_row from public.appointments where public.appointments.id = existing_appointment.id;
  perform private.record_appointment_event(updated_row, actor, 'cancelled', reason);
  return next_version;
end;
$$;

create or replace function public.cancel_support_appointment(
  target_appointment_id uuid,
  expected_version integer,
  input_reschedule_requested boolean default false
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_permission public.household_permission;
  current_specialist_id uuid;
  existing_appointment public.appointments%rowtype;
  reason text;
  next_version integer;
begin
  select appointment.* into existing_appointment
  from public.appointments as appointment
  where appointment.id = target_appointment_id
  for update;
  if not found then
    raise exception 'This appointment is unavailable.' using errcode = '42501';
  end if;
  if existing_appointment.status not in ('proposed', 'scheduled') then
    raise exception 'This appointment is already final.' using errcode = '55000';
  end if;
  if expected_version is null or existing_appointment.version is distinct from expected_version then
    raise exception 'This appointment was updated elsewhere.' using errcode = '40001';
  end if;

  current_permission := private.current_support_permission(existing_appointment.household_id);
  current_specialist_id := private.current_specialist_profile_id();
  if current_permission is not null and current_permission <> 'viewer' then
    reason := case when coalesce(input_reschedule_requested, false)
      then 'reschedule_requested' else 'household_cancelled' end;
  elsif current_specialist_id is not null
    and private.is_assigned_open_request_specialist(existing_appointment.support_thread_id)
    and existing_appointment.specialist_id = current_specialist_id then
    reason := case when coalesce(input_reschedule_requested, false)
      then 'reschedule_requested' else 'specialist_cancelled' end;
  else
    raise exception 'This appointment action is unavailable.' using errcode = '42501';
  end if;

  next_version := private.cancel_appointment_row(existing_appointment, current_user_id, reason);
  return query select existing_appointment.id, next_version;
end;
$$;

create or replace function public.complete_support_appointment(
  target_appointment_id uuid,
  expected_version integer
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_specialist_id uuid;
  existing_appointment public.appointments%rowtype;
  next_version integer;
  updated_row public.appointments%rowtype;
begin
  select appointment.* into existing_appointment
  from public.appointments as appointment
  where appointment.id = target_appointment_id
  for update;
  if not found then
    raise exception 'This appointment is unavailable.' using errcode = '42501';
  end if;

  current_specialist_id := private.current_specialist_profile_id();
  if current_specialist_id is null
    or existing_appointment.specialist_id is distinct from current_specialist_id
    or not private.is_assigned_open_request_specialist(existing_appointment.support_thread_id) then
    raise exception 'This appointment action is unavailable.' using errcode = '42501';
  end if;
  if existing_appointment.status <> 'scheduled' then
    raise exception 'Only a scheduled appointment can be completed.' using errcode = '55000';
  end if;
  if expected_version is null or existing_appointment.version is distinct from expected_version then
    raise exception 'This appointment was updated elsewhere.' using errcode = '40001';
  end if;
  if existing_appointment.start_time > now() then
    raise exception 'This appointment has not started yet.' using errcode = '22023';
  end if;

  next_version := existing_appointment.version + 1;
  insert into private.appointment_markers (appointment_id, transaction_id)
  values (existing_appointment.id, txid_current()) on conflict do nothing;
  update public.appointments as appointment
  set status = 'completed', version = next_version, completed_by = current_user_id, completed_at = now()
  where appointment.id = existing_appointment.id;
  delete from private.appointment_markers as marker
  where marker.appointment_id = existing_appointment.id and marker.transaction_id = txid_current();

  select * into updated_row from public.appointments where public.appointments.id = existing_appointment.id;
  perform private.record_appointment_event(updated_row, current_user_id, 'completed');
  return query select existing_appointment.id, next_version;
end;
$$;

-- 8. Automatic cancellation when the grant or the request ends.

create or replace function private.cancel_live_request_appointments(
  target_thread_id uuid,
  actor uuid,
  reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  live_appointment public.appointments%rowtype;
  cancelled_count integer := 0;
begin
  for live_appointment in
    select appointment.* from public.appointments as appointment
    where appointment.support_thread_id = target_thread_id
      and appointment.status in ('proposed', 'scheduled')
    for update
  loop
    perform private.cancel_appointment_row(live_appointment, actor, reason);
    cancelled_count := cancelled_count + 1;
  end loop;
  return cancelled_count;
end;
$$;

-- ETH-026 revocation now ends any live appointment in the same transaction.
create or replace function private.revoke_support_request_specialist(
  existing_thread public.support_threads,
  actor_user_id uuid,
  revocation_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer := existing_thread.assignment_version + 1;
begin
  perform private.cancel_live_request_appointments(
    existing_thread.id, actor_user_id, 'assignment_revoked'
  );

  insert into private.support_assignment_markers (thread_id, transaction_id)
  values (existing_thread.id, txid_current())
  on conflict do nothing;

  update public.support_threads as thread
  set
    specialist_id = null,
    specialist_assigned_at = null,
    specialist_assigned_by = null,
    assignment_version = next_version,
    assignment_updated_at = now()
  where thread.id = existing_thread.id;

  delete from private.support_assignment_markers as marker
  where marker.thread_id = existing_thread.id and marker.transaction_id = txid_current();

  insert into public.support_request_assignment_events (
    thread_id, household_id, specialist_id, actor_user_id, action, assignment_version, reason
  ) values (
    existing_thread.id, existing_thread.household_id, existing_thread.specialist_id, actor_user_id,
    'revoked', next_version, revocation_reason
  );

  return next_version;
end;
$$;

-- ETH-025 close and cancel now also end any live appointment.
create or replace function private.transition_support_request(
  target_thread_id uuid,
  expected_version integer,
  next_status text
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_permission public.household_permission;
  existing_thread public.support_threads%rowtype;
begin
  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = target_thread_id
  for update;
  if not found then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;

  current_permission := private.current_support_permission(existing_thread.household_id);
  if current_permission is null
    or current_permission = 'viewer'
    or (current_permission = 'member' and existing_thread.created_by <> current_user_id) then
    raise exception 'This support request change is unavailable.' using errcode = '42501';
  end if;
  if existing_thread.status <> 'open' then
    raise exception 'This support request is already closed or cancelled.' using errcode = '55000';
  end if;
  if expected_version is null or existing_thread.version is distinct from expected_version then
    raise exception 'This support request was updated elsewhere.' using errcode = '40001';
  end if;

  perform private.cancel_live_request_appointments(
    existing_thread.id, current_user_id,
    case when next_status = 'closed' then 'request_closed' else 'request_cancelled' end
  );

  if existing_thread.specialist_id is not null then
    insert into private.support_assignment_markers (thread_id, transaction_id)
    values (existing_thread.id, txid_current())
    on conflict do nothing;
  end if;

  update public.support_threads as thread
  set
    status = next_status,
    version = existing_thread.version + 1,
    closed_by = case when next_status = 'closed' then current_user_id else null end,
    closed_at = case when next_status = 'closed' then now() else null end,
    cancelled_by = case when next_status = 'cancelled' then current_user_id else null end,
    cancelled_at = case when next_status = 'cancelled' then now() else null end,
    specialist_id = null,
    specialist_assigned_at = null,
    specialist_assigned_by = null,
    assignment_version = case
      when existing_thread.specialist_id is not null then existing_thread.assignment_version + 1
      else existing_thread.assignment_version
    end,
    assignment_updated_at = case
      when existing_thread.specialist_id is not null then now()
      else existing_thread.assignment_updated_at
    end
  where thread.id = existing_thread.id
  returning thread.id, thread.version into id, version;

  if existing_thread.specialist_id is not null then
    delete from private.support_assignment_markers as marker
    where marker.thread_id = existing_thread.id and marker.transaction_id = txid_current();

    insert into public.support_request_assignment_events (
      thread_id, household_id, specialist_id, actor_user_id, action, assignment_version, reason
    ) values (
      existing_thread.id, existing_thread.household_id, existing_thread.specialist_id, current_user_id,
      'revoked', existing_thread.assignment_version + 1,
      case when next_status = 'closed' then 'request_closed' else 'request_cancelled' end
    );
  end if;

  insert into public.support_request_events (
    thread_id, household_id, actor_user_id, action, from_status, to_status, request_version
  ) values (
    existing_thread.id, existing_thread.household_id, current_user_id,
    case when next_status = 'closed' then 'closed' else 'cancelled' end,
    'open', next_status, existing_thread.version + 1
  );

  return next;
end;
$$;

-- 9. Safe read payloads.

create or replace function public.get_support_appointment(target_thread_id uuid)
returns table(
  id uuid,
  status text,
  version integer,
  start_time timestamptz,
  timezone text,
  duration_minutes integer,
  modality text,
  meeting_url text,
  specialist_name text,
  consented_at timestamptz,
  cancellation_reason text,
  can_accept boolean,
  can_decline boolean,
  can_cancel boolean,
  can_complete boolean,
  can_propose boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_permission public.household_permission;
  current_specialist_id uuid;
  existing_thread public.support_threads%rowtype;
  is_specialist boolean;
  is_admin boolean := private.is_current_user_administrator();
begin
  select thread.* into existing_thread from public.support_threads as thread
  where thread.id = target_thread_id;
  if not found then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;
  current_permission := private.current_support_permission(existing_thread.household_id);
  current_specialist_id := private.current_specialist_profile_id();
  is_specialist := private.is_assigned_open_request_specialist(existing_thread.id)
    and existing_thread.specialist_id = current_specialist_id;
  if current_permission is null and not is_specialist and not is_admin then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;

  return query
  select
    appointment.id,
    appointment.status,
    appointment.version,
    appointment.start_time,
    appointment.timezone,
    appointment.duration_minutes,
    appointment.modality,
    -- The meeting link is released only to the two parties, and only once the
    -- household has consented.
    case
      when appointment.status = 'scheduled'
        and (current_permission is not null or is_specialist)
        then appointment.meeting_url
      else null
    end,
    coalesce(
      nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      'Ethiospectrum specialist'
    ),
    appointment.consented_at,
    appointment.cancellation_reason,
    (appointment.status = 'proposed' and current_permission is not null and current_permission <> 'viewer'),
    (appointment.status = 'proposed' and current_permission is not null and current_permission <> 'viewer'),
    (appointment.status in ('proposed', 'scheduled')
      and ((current_permission is not null and current_permission <> 'viewer') or is_specialist)),
    (appointment.status = 'scheduled' and is_specialist and appointment.start_time <= now()),
    (existing_thread.status = 'open' and is_specialist)
  from public.appointments as appointment
  left join public.specialists as specialist on specialist.id = appointment.specialist_id
  left join public.profiles as profile on profile.id = specialist.user_id
  where appointment.support_thread_id = existing_thread.id
  order by appointment.created_at desc, appointment.id
  limit 20;
end;
$$;

create or replace function public.list_appointment_events(target_appointment_id uuid)
returns table(
  id uuid,
  action text,
  reason text,
  appointment_version integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    private.appointment_household_reader(target_appointment_id)
    or private.appointment_assigned_specialist(target_appointment_id)
    or private.is_current_user_administrator()
  ) then
    raise exception 'Appointment history is unavailable.' using errcode = '42501';
  end if;
  return query
  select event.id, event.action, event.reason, event.appointment_version, event.created_at
  from public.appointment_events as event
  where event.appointment_id = target_appointment_id
  order by event.created_at desc, event.id desc
  limit 50;
end;
$$;

-- 10. Narrow grants.

revoke all on table private.appointment_markers from public, anon, authenticated;
revoke all on function private.has_appointment_marker(uuid) from public, anon, authenticated;
revoke all on function private.appointment_integrity() from public, anon, authenticated;
revoke all on function private.appointment_event_immutable() from public, anon, authenticated;
revoke all on function private.record_appointment_event(public.appointments, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function private.cancel_appointment_row(public.appointments, uuid, text)
  from public, anon, authenticated;
revoke all on function private.cancel_live_request_appointments(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function private.resolve_appointment_instant(timestamp, text) from public, anon;
revoke all on function private.appointment_household_reader(uuid) from public, anon;
revoke all on function private.appointment_assigned_specialist(uuid) from public, anon;
grant execute on function private.appointment_household_reader(uuid) to authenticated;
grant execute on function private.appointment_assigned_specialist(uuid) to authenticated;

revoke all on function public.propose_support_appointment(uuid, timestamp, text, integer, text, text, uuid, uuid)
  from public, anon;
revoke all on function public.accept_support_appointment(uuid, integer, text, boolean) from public, anon;
revoke all on function public.decline_support_appointment(uuid, integer) from public, anon;
revoke all on function public.cancel_support_appointment(uuid, integer, boolean) from public, anon;
revoke all on function public.complete_support_appointment(uuid, integer) from public, anon;
revoke all on function public.get_support_appointment(uuid) from public, anon;
revoke all on function public.list_appointment_events(uuid) from public, anon;
grant execute on function public.propose_support_appointment(uuid, timestamp, text, integer, text, text, uuid, uuid)
  to authenticated;
grant execute on function public.accept_support_appointment(uuid, integer, text, boolean) to authenticated;
grant execute on function public.decline_support_appointment(uuid, integer) to authenticated;
grant execute on function public.cancel_support_appointment(uuid, integer, boolean) to authenticated;
grant execute on function public.complete_support_appointment(uuid, integer) to authenticated;
grant execute on function public.get_support_appointment(uuid) to authenticated;
grant execute on function public.list_appointment_events(uuid) to authenticated;
