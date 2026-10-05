-- When booking a consultation, the family chooses how to schedule:
--   direct  - one specific time they want
--   propose - two or three options for the specialist/administrator to pick
-- The choice is stored with the request; staff then schedule a time from it
-- through the existing appointment functions, which re-validate everything.

create table public.service_request_requested_times (
  service_request_id uuid primary key references public.service_requests (id) on delete cascade,
  scheduling_mode text not null check (scheduling_mode in ('direct', 'propose')),
  -- [{"local_start": "2026-10-15T14:30", "timezone": "America/Chicago", "start_at": "..."}]
  slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) between 1 and 3),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint service_request_requested_times_count check (
    (scheduling_mode = 'direct' and jsonb_array_length(slots) = 1)
    or (scheduling_mode = 'propose' and jsonb_array_length(slots) between 2 and 3)
  )
);

alter table public.service_request_requested_times enable row level security;
alter table public.service_request_requested_times force row level security;

create policy service_request_requested_times_read on public.service_request_requested_times
  for select to authenticated using (private.can_read_service_request(service_request_id));

grant select on public.service_request_requested_times to authenticated;

create function public.set_requested_schedule(target_request_id uuid, input_mode text, input_slots jsonb)
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
  if request.service_type <> 'consultation' or request.status <> 'pending_review' then
    raise exception 'Requested times can only be set on a new consultation.' using errcode = '55000';
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

revoke all on function public.set_requested_schedule(uuid, text, jsonb) from public, anon;
grant execute on function public.set_requested_schedule(uuid, text, jsonb) to authenticated;
