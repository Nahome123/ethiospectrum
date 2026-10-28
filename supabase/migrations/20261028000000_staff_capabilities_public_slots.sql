-- 1. Upcoming free Parent Support times for the public home page. Reveals only
--    times (and which specialist), never who booked anything.
-- 2. Launch staff capabilities, by role, for the named Ethiospectrum team:
--      Yamrot  (provider, child development consultant) -> Consultation (English, Amharic)
--      Milka   (BCBA candidate, provider)               -> Consultation (English, Amharic)
--                                                          and IEP Language Assistance (Amharic, remote)
--      Yoftahe (consultant, parent support)             -> Parent Support (English, Amharic)
--    Only staff accounts (specialist or administrator role) are matched, by
--    first name; families are never touched. The same defaults are applied if
--    one of them is promoted to specialist later. Administrators can change
--    any of it afterwards in Admin -> Specialists.

create function public.list_public_parent_support_slots()
returns table (specialist_id uuid, start_at timestamptz, end_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select slot.specialist_id, slot.start_at, slot.end_at
  from private.open_service_slots('parent_support', null, null, now(), now() + interval '14 days') as slot
  limit 12;
$$;
revoke all on function public.list_public_parent_support_slots() from public;
grant execute on function public.list_public_parent_support_slots() to anon, authenticated;

create function private.apply_launch_staff_capabilities(target_specialist uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_name text;
begin
  select lower(btrim(profile.first_name)) into staff_name
  from public.specialists as specialist
  join public.profiles as profile on profile.id = specialist.user_id
  join public.user_roles as role_row on role_row.user_id = specialist.user_id
    and role_row.role in ('specialist'::public.app_role, 'administrator'::public.app_role)
  where specialist.id = target_specialist;
  if staff_name is null or staff_name not in ('yamrot', 'milka', 'yoftahe') then
    return;
  end if;

  if staff_name in ('yamrot', 'milka') then
    insert into public.specialist_capabilities (specialist_id, service_type, language, delivery_method)
    values (target_specialist, 'consultation', 'en', 'remote'), (target_specialist, 'consultation', 'am', 'remote')
    on conflict do nothing;
  end if;
  if staff_name = 'milka' then
    insert into public.specialist_capabilities (specialist_id, service_type, language, delivery_method)
    values (target_specialist, 'iep_language_assistance', 'am', 'remote')
    on conflict do nothing;
  end if;
  if staff_name = 'yoftahe' then
    insert into public.specialist_capabilities (specialist_id, service_type, language, delivery_method)
    values (target_specialist, 'parent_support', 'en', 'remote'), (target_specialist, 'parent_support', 'am', 'remote')
    on conflict do nothing;
  end if;

  update public.specialists as specialist
  set availability_status = 'available',
      languages = coalesce((select array_agg(distinct capability.language order by capability.language)
        from public.specialist_capabilities as capability where capability.specialist_id = specialist.id), array[]::text[]),
      specialties = coalesce((select array_agg(distinct capability.service_type order by capability.service_type)
        from public.specialist_capabilities as capability where capability.specialist_id = specialist.id), array[]::text[]),
      updated_at = now()
  where specialist.id = target_specialist;
end;
$$;
revoke all on function private.apply_launch_staff_capabilities(uuid) from public, anon, authenticated;

-- Existing staff now.
do $$
declare target uuid;
begin
  for target in select id from public.specialists loop
    perform private.apply_launch_staff_capabilities(target);
  end loop;
end;
$$;

-- Staff promoted later (promotion creates their specialist profile).
create function private.apply_launch_staff_capabilities_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_launch_staff_capabilities(new.id);
  return new;
end;
$$;
revoke all on function private.apply_launch_staff_capabilities_on_insert() from public, anon, authenticated;
create trigger specialists_launch_capabilities
  after insert on public.specialists
  for each row execute function private.apply_launch_staff_capabilities_on_insert();
