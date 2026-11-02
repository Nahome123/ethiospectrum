-- Parent Support staff role.
--
-- A person with the parent_support role works in the staff (specialist)
-- workspace, is booked only for Parent Support sessions, and manages their own
-- availability: time zone, weekly hours, meeting link, languages, and whether
-- they are taking bookings. Specialists (and administrators) can manage their
-- own hours and meeting link the same way.

-- 1. Every staff check that accepts specialists and administrators accepts
--    Parent Support staff too. Their access to any request still depends on
--    being assigned to it, exactly as for specialists.
set search_path = '';

do $$
declare
  target record;
  updated text;
begin
  for target in
    select p.oid, pg_catalog.pg_get_functiondef(p.oid) as definition
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and pg_catalog.pg_get_functiondef(p.oid) like
        '%''specialist''::public.app_role, ''administrator''::public.app_role)%'
  loop
    updated := pg_catalog.replace(
      target.definition,
      '''specialist''::public.app_role, ''administrator''::public.app_role)',
      '''specialist''::public.app_role, ''administrator''::public.app_role, ''parent_support''::public.app_role)'
    );
    execute updated;
  end loop;
end;
$$;

reset search_path;

-- 2. Parent Support staff offer Parent Support only ---------------------------------------

create function private.guard_parent_support_capabilities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.service_type <> 'parent_support' and exists (
    select 1 from public.specialists as specialist
    join public.user_roles as role_row on role_row.user_id = specialist.user_id
    where specialist.id = new.specialist_id and role_row.role = 'parent_support'::public.app_role
  ) then
    raise exception 'Parent Support staff can only offer Parent Support.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_parent_support_capabilities() from public, anon, authenticated;
create trigger specialist_capabilities_parent_support_guard
  before insert or update on public.specialist_capabilities
  for each row execute function private.guard_parent_support_capabilities();

-- The launch defaults (by name) respect the role.
create or replace function private.apply_launch_staff_capabilities(target_specialist uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_name text;
  staff_role public.app_role;
begin
  select lower(btrim(profile.first_name)), role_row.role into staff_name, staff_role
  from public.specialists as specialist
  join public.profiles as profile on profile.id = specialist.user_id
  join public.user_roles as role_row on role_row.user_id = specialist.user_id
    and role_row.role in ('specialist'::public.app_role, 'administrator'::public.app_role, 'parent_support'::public.app_role)
  where specialist.id = target_specialist;
  if staff_name is null or staff_name not in ('yamrot', 'milka', 'yoftahe') then
    return;
  end if;

  if staff_name in ('yamrot', 'milka') and staff_role <> 'parent_support'::public.app_role then
    insert into public.specialist_capabilities (specialist_id, service_type, language, delivery_method)
    values (target_specialist, 'consultation', 'en', 'remote'), (target_specialist, 'consultation', 'am', 'remote')
    on conflict do nothing;
  end if;
  if staff_name = 'milka' and staff_role <> 'parent_support'::public.app_role then
    insert into public.specialist_capabilities (specialist_id, service_type, language, delivery_method)
    values (target_specialist, 'iep_language_assistance', 'am', 'remote')
    on conflict do nothing;
  end if;
  if staff_name = 'yoftahe' then
    insert into public.specialist_capabilities (specialist_id, service_type, language, delivery_method)
    values (target_specialist, 'parent_support', 'en', 'remote'), (target_specialist, 'parent_support', 'am', 'remote')
    on conflict do nothing;
  end if;
  perform private.refresh_specialist_summary(target_specialist);
  update public.specialists set availability_status = 'available', updated_at = now() where id = target_specialist;
end;
$$;

-- Keeps the specialists.languages / specialties summary in step with capabilities.
create function private.refresh_specialist_summary(target_specialist uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.specialists as specialist
  set languages = coalesce((select array_agg(distinct capability.language order by capability.language)
        from public.specialist_capabilities as capability where capability.specialist_id = specialist.id), array[]::text[]),
      specialties = coalesce((select array_agg(distinct capability.service_type order by capability.service_type)
        from public.specialist_capabilities as capability where capability.specialist_id = specialist.id), array[]::text[]),
      updated_at = now()
  where specialist.id = target_specialist;
$$;
revoke all on function private.refresh_specialist_summary(uuid) from public, anon, authenticated;

-- Granting the role sets the person up: a staff profile, taking bookings,
-- Parent Support in English and Amharic (changeable on their availability
-- page), and nothing else.
create function private.setup_parent_support_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_specialist uuid;
begin
  if new.role <> 'parent_support'::public.app_role then
    return new;
  end if;
  insert into public.specialists (user_id, availability_status)
  values (new.user_id, 'available')
  on conflict (user_id) do nothing;
  select id into target_specialist from public.specialists where user_id = new.user_id;
  delete from public.specialist_capabilities
  where specialist_id = target_specialist and service_type <> 'parent_support';
  if not exists (
    select 1 from public.specialist_capabilities
    where specialist_id = target_specialist and service_type = 'parent_support'
  ) then
    insert into public.specialist_capabilities (specialist_id, service_type, language, delivery_method)
    values (target_specialist, 'parent_support', 'en', 'remote'), (target_specialist, 'parent_support', 'am', 'remote')
    on conflict do nothing;
  end if;
  perform private.refresh_specialist_summary(target_specialist);
  return new;
end;
$$;
revoke all on function private.setup_parent_support_staff() from public, anon, authenticated;
create trigger user_roles_parent_support_setup
  after insert or update of role on public.user_roles
  for each row execute function private.setup_parent_support_staff();

-- 3. Schedules: shared by administrators and staff themselves ---------------------------

create function private.save_specialist_schedule(
  target_specialist_id uuid,
  input_timezone text,
  input_hours jsonb,
  input_meeting_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare entry jsonb;
begin
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
revoke all on function private.save_specialist_schedule(uuid, text, jsonb, text) from public, anon, authenticated;

create or replace function public.admin_update_specialist_schedule(
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
begin
  perform private.require_administrator();
  perform private.save_specialist_schedule(target_specialist_id, input_timezone, input_hours, input_meeting_url);
end;
$$;

-- The signed-in staff member's own schedule.
create function public.get_my_staff_schedule()
returns table (
  specialist_id uuid,
  is_parent_support boolean,
  accepting_bookings boolean,
  schedule_timezone text,
  default_meeting_url text,
  hours jsonb,
  parent_support_languages text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select specialist.id,
    private.current_app_role() = 'parent_support'::public.app_role,
    specialist.availability_status = 'available',
    specialist.schedule_timezone,
    specialist.default_meeting_url,
    coalesce((
      select jsonb_agg(jsonb_build_object('weekday', weekly.weekday,
        'start', to_char(weekly.start_time, 'HH24:MI'), 'end', to_char(weekly.end_time, 'HH24:MI'))
        order by weekly.weekday, weekly.start_time)
      from public.specialist_weekly_hours as weekly where weekly.specialist_id = specialist.id
    ), '[]'::jsonb),
    coalesce((
      select array_agg(capability.language order by capability.language)
      from public.specialist_capabilities as capability
      where capability.specialist_id = specialist.id and capability.service_type = 'parent_support'
    ), array[]::text[])
  from public.specialists as specialist
  where specialist.id = private.current_specialist_profile_id();
$$;

create function public.update_my_staff_schedule(
  input_timezone text,
  input_hours jsonb,
  input_meeting_url text default null,
  input_accepting_bookings boolean default true,
  input_parent_support_languages text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_specialist uuid := private.current_specialist_profile_id();
  chosen_language text;
begin
  if target_specialist is null then
    raise exception 'Only staff can set availability.' using errcode = '42501';
  end if;
  perform private.save_specialist_schedule(target_specialist, input_timezone, input_hours, input_meeting_url);
  update public.specialists
  set availability_status = case when coalesce(input_accepting_bookings, true) then 'available' else 'unavailable' end,
      updated_at = now()
  where id = target_specialist;

  -- Parent Support staff choose the languages they hold sessions in.
  if input_parent_support_languages is not null
    and private.current_app_role() = 'parent_support'::public.app_role then
    if cardinality(input_parent_support_languages) not between 1 and 3
      or not (input_parent_support_languages <@ array['en', 'am', 'es']::text[]) then
      raise exception 'Choose at least one language.' using errcode = '22023';
    end if;
    delete from public.specialist_capabilities
    where specialist_id = target_specialist and service_type = 'parent_support';
    foreach chosen_language in array input_parent_support_languages loop
      insert into public.specialist_capabilities (specialist_id, service_type, language, delivery_method)
      values (target_specialist, 'parent_support', chosen_language, 'remote')
      on conflict do nothing;
    end loop;
    perform private.refresh_specialist_summary(target_specialist);
  end if;
end;
$$;

revoke all on function public.get_my_staff_schedule() from public, anon;
grant execute on function public.get_my_staff_schedule() to authenticated;
revoke all on function public.update_my_staff_schedule(text, jsonb, text, boolean, text[]) from public, anon;
grant execute on function public.update_my_staff_schedule(text, jsonb, text, boolean, text[]) to authenticated;
