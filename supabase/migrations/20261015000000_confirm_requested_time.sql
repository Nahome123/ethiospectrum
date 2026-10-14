-- Simple scheduling: the family picks a convenient time when booking a
-- consultation or IEP support, and staff only confirm it.
--   1. Requested times may now be set on a new IEP request too.
--   2. confirm_requested_time lets an administrator or the assigned
--      specialist turn a requested time into a confirmed appointment in one
--      step. In-person sessions use the location the family asked for.

create or replace function public.set_requested_schedule(target_request_id uuid, input_mode text, input_slots jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.service_requests%rowtype;
  slot jsonb;
  local_start timestamp;
  start_instant timestamptz;
  normalized jsonb := '[]'::jsonb;
  seen timestamptz[] := array[]::timestamptz[];
begin
  select * into request from public.service_requests where id = target_request_id for update;
  if request.id is null or not private.household_actor_can(request.household_id, 'submit_requests') then
    raise exception 'This request is unavailable.' using errcode = '42501';
  end if;
  if request.service_type not in ('consultation', 'iep_language_assistance') or request.status <> 'pending_review' then
    raise exception 'Requested times can only be set on a new request.' using errcode = '55000';
  end if;
  if input_mode not in ('direct', 'propose') or jsonb_typeof(input_slots) <> 'array'
    or (input_mode = 'direct' and jsonb_array_length(input_slots) <> 1)
    or (input_mode = 'propose' and jsonb_array_length(input_slots) not between 2 and 3) then
    raise exception 'Choose one time, or two to three options.' using errcode = '22023';
  end if;

  for slot in select value from jsonb_array_elements(input_slots) loop
    if jsonb_typeof(slot) <> 'object'
      or coalesce(slot ->> 'local_start', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then
      raise exception 'The requested time is invalid.' using errcode = '22023';
    end if;
    begin
      local_start := (slot ->> 'local_start')::timestamp;
    exception when others then
      raise exception 'The requested time is invalid.' using errcode = '22023';
    end;
    start_instant := private.resolve_appointment_instant(local_start, slot ->> 'timezone');
    if start_instant <= now() + interval '1 hour' then
      raise exception 'Requested times must be at least an hour from now.' using errcode = '22023';
    end if;
    if start_instant = any(seen) then
      raise exception 'Each proposed time must be different.' using errcode = '22023';
    end if;
    seen := seen || start_instant;
    normalized := normalized || jsonb_build_array(jsonb_build_object(
      'local_start', slot ->> 'local_start',
      'timezone', slot ->> 'timezone',
      'start_at', start_instant
    ));
  end loop;

  insert into public.service_request_requested_times (service_request_id, scheduling_mode, slots, created_by)
  values (request.id, input_mode, normalized, auth.uid())
  on conflict (service_request_id) do update
  set scheduling_mode = excluded.scheduling_mode, slots = excluded.slots,
      created_by = excluded.created_by, created_at = now();
end;
$$;

create function public.confirm_requested_time(
  target_request_id uuid,
  input_slot_index integer,
  input_meeting_url text,
  expected_version integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.service_requests%rowtype;
  requested public.service_request_requested_times%rowtype;
  chosen jsonb;
  actor_role text;
  created_id uuid;
  starts timestamptz;
begin
  request := private.lock_request_for_staff(target_request_id, true);
  perform private.assert_version(request, expected_version);
  actor_role := case when private.is_current_user_administrator() then 'administrator' else 'specialist' end;
  if request.specialist_id is null then
    raise exception 'Assign a specialist before scheduling.' using errcode = '55000';
  end if;
  if request.status not in ('assigned', 'awaiting_availability', 'awaiting_payment', 'payment_failed', 'appointment_proposed', 'reschedule_requested') then
    raise exception 'The appointment cannot be scheduled at this stage.' using errcode = '55000';
  end if;
  if exists (select 1 from public.service_appointments where service_request_id = request.id and kind = 'primary' and status = 'confirmed') then
    raise exception 'Modify the confirmed appointment instead.' using errcode = '55000';
  end if;

  select * into requested from public.service_request_requested_times where service_request_id = request.id;
  chosen := requested.slots -> coalesce(input_slot_index, 0);
  if requested.service_request_id is null or chosen is null then
    raise exception 'The family has not requested this time.' using errcode = '22023';
  end if;

  update public.service_appointments set status = 'superseded', updated_at = now()
  where service_request_id = request.id and kind = 'primary' and status = 'proposed';
  created_id := private.insert_service_appointment(
    request,
    'primary',
    jsonb_build_object(
      'local_start', chosen ->> 'local_start',
      'timezone', chosen ->> 'timezone',
      'location_type', case when request.delivery_method = 'remote' then 'remote'
        else coalesce(request.preferred_location_type, 'ethiospectrum_location') end,
      'location_details', case when request.delivery_method = 'remote' then null else request.preferred_location_details end,
      'meeting_url', case when request.delivery_method = 'remote' then nullif(btrim(coalesce(input_meeting_url, '')), '') end
    ),
    'confirmed',
    gen_random_uuid(),
    actor_role,
    true
  );
  select start_at into starts from public.service_appointments where id = created_id;
  perform private.set_request_status(request.id,
    case when request.payment_status = 'paid' then 'appointment_confirmed' else 'awaiting_payment' end,
    'appointment_scheduled_directly', jsonb_build_object('start_at', starts, 'requested_time', true));
  perform private.sync_request_appointment_status(request.id);
  perform private.notify_request_household(request.id, 'appointment_confirmed',
    jsonb_build_object('start_at', starts, 'kind', 'primary', 'scheduled_directly', true));
  perform private.notify_request_specialist(request.id, 'specialist_appointment_confirmed',
    jsonb_build_object('start_at', starts, 'kind', 'primary'));
  return created_id;
end;
$$;
revoke all on function public.confirm_requested_time(uuid, integer, text, integer) from public, anon;
grant execute on function public.confirm_requested_time(uuid, integer, text, integer) to authenticated;
