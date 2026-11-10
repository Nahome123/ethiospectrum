-- Families can choose who they would like to talk with for free Parent Support.
--   * Yamrot and Milka also offer Parent Support (English, Amharic), matched by
--     first name on staff accounts like the launch capabilities in 20261028000000.
--   * The request form lists Parent Support providers who are taking bookings
--     and have a Calendly page; the family can pick one or leave it to the team.
--   * When an administrator approves, the chosen provider is assigned if they
--     still qualify; otherwise the usual language-based choice applies.

-- 1. Remember who the family asked for ----------------------------------------------------

alter table public.service_requests
  add column if not exists requested_specialist_id uuid references public.specialists(id) on delete set null;

-- 2. Yamrot and Milka offer Parent Support -------------------------------------------------

do $$
declare
  definition text := pg_get_functiondef('private.apply_launch_staff_capabilities(uuid)'::regprocedure);
  widened text := replace(definition,
    'if staff_name = ''yoftahe'' then',
    'if staff_name in (''yamrot'', ''milka'', ''yoftahe'') then');
  target uuid;
begin
  if widened = definition then
    raise exception 'apply_launch_staff_capabilities changed; update this migration.';
  end if;
  execute widened;
  for target in
    select specialist.id
    from public.specialists as specialist
    join public.profiles as profile on profile.id = specialist.user_id
    where lower(btrim(profile.first_name)) in ('yamrot', 'milka')
  loop
    perform private.apply_launch_staff_capabilities(target);
  end loop;
end;
$$;

-- 3. Who families can choose -----------------------------------------------------------------

create function private.parent_support_provider_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select specialist.id
  from public.specialists as specialist
  where specialist.booking_page_url is not null
    and specialist.availability_status = 'available'
    and exists (
      select 1 from public.specialist_capabilities as capability
      where capability.specialist_id = specialist.id and capability.service_type = 'parent_support'
    );
$$;

create function public.list_parent_support_providers()
returns table (specialist_id uuid, display_name text, first_name text, languages text[])
language sql
stable
security definer
set search_path = ''
as $$
  select specialist.id,
    coalesce(nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Ethiospectrum specialist'),
    coalesce(btrim(profile.first_name), ''),
    coalesce((
      select array_agg(distinct capability.language order by capability.language)
      from public.specialist_capabilities as capability
      where capability.specialist_id = specialist.id and capability.service_type = 'parent_support'
    ), array[]::text[])
  from public.specialists as specialist
  left join public.profiles as profile on profile.id = specialist.user_id
  where auth.uid() is not null
    and specialist.id in (select private.parent_support_provider_ids())
  order by 2, 1;
$$;

-- 4. The request carries the choice --------------------------------------------------------

drop function public.request_parent_support(uuid, text, text, uuid);

create function public.request_parent_support(
  input_dependent_id uuid,
  input_description text,
  input_language text,
  input_idempotency_key uuid,
  input_specialist_id uuid default null
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
begin
  if current_user_id is null or target_household is null
    or not private.household_actor_can(target_household, 'submit_requests') then
    raise exception 'You do not have permission to request services.' using errcode = '42501';
  end if;
  select id into existing_id from public.service_requests
  where requested_by = current_user_id and idempotency_key = input_idempotency_key;
  if existing_id is not null then return existing_id; end if;

  select * into target_service from public.services where service_type = 'parent_support' and active;
  if target_service.id is null then
    raise exception 'This service is not available.' using errcode = '22023';
  end if;
  if input_language is null or input_language not in ('en', 'am', 'es')
    or char_length(btrim(coalesce(input_description, ''))) not between 10 and 2000 then
    raise exception 'Check the request details.' using errcode = '22023';
  end if;
  if input_specialist_id is not null
    and input_specialist_id not in (select private.parent_support_provider_ids()) then
    raise exception 'Choose someone from the list.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.dependents
    where id = input_dependent_id and household_id = target_household and archived_at is null
  ) then
    raise exception 'Choose a dependent from your household.' using errcode = '22023';
  end if;
  -- One Parent Support request waiting for approval at a time.
  if exists (
    select 1 from public.service_requests
    where household_id = target_household and service_type = 'parent_support' and status = 'pending_review'
  ) then
    raise exception 'A Parent Support request is already waiting for approval.' using errcode = 'ES429';
  end if;
  if (select count(*) from public.service_requests
      where household_id = target_household and status not in ('completed', 'cancelled', 'declined')) >= 10 then
    raise exception 'Too many open service requests.' using errcode = '54000';
  end if;

  insert into public.service_requests (
    household_id, dependent_id, service_id, service_type, requested_by, description,
    preferred_language, delivery_method, status, payment_status, idempotency_key, requested_specialist_id
  ) values (
    target_household, input_dependent_id, target_service.id, 'parent_support', current_user_id,
    btrim(coalesce(input_description, '')), input_language, 'remote', 'pending_review', 'not_required',
    input_idempotency_key, input_specialist_id
  ) returning id into created_id;

  insert into public.service_request_activities (service_request_id, activity_type)
  values (created_id, 'consultation_session');

  perform private.record_request_event(created_id, 'request_created', null, 'pending_review');
  perform private.notify_request_household(created_id, 'request_received');
  perform private.notify_request_administrators(created_id, 'admin_new_request');
  return created_id;
end;
$$;

-- 5. Approval honours the choice -------------------------------------------------------------

drop function private.parent_support_provider(text);

create function private.parent_support_provider(input_language text, input_preferred uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select specialist.id
  from public.specialists as specialist
  where specialist.id in (select private.parent_support_provider_ids())
  order by specialist.id is not distinct from input_preferred desc,
    exists (
      select 1 from public.specialist_capabilities as capability
      where capability.specialist_id = specialist.id and capability.service_type = 'parent_support'
        and capability.language = input_language
    ) desc,
    specialist.created_at, specialist.id
  limit 1;
$$;

do $$
declare
  definition text := pg_get_functiondef('public.admin_approve_parent_support(uuid, integer)'::regprocedure);
  patched text := replace(definition,
    'private.parent_support_provider(request.preferred_language)',
    'private.parent_support_provider(request.preferred_language, request.requested_specialist_id)');
begin
  if patched = definition then
    raise exception 'admin_approve_parent_support changed; update this migration.';
  end if;
  execute patched;
end;
$$;

revoke all on function private.parent_support_provider_ids() from public, anon, authenticated;
revoke all on function private.parent_support_provider(text, uuid) from public, anon, authenticated;
revoke all on function public.list_parent_support_providers() from public, anon;
grant execute on function public.list_parent_support_providers() to authenticated;
revoke all on function public.request_parent_support(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.request_parent_support(uuid, text, text, uuid, uuid) to authenticated;
