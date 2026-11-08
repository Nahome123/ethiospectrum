-- Parent Support goes through an administrator.
--   1. A family sends a short request (no time). It waits in Admin -> Service
--      requests as pending review; administrators are notified.
--   2. An administrator approves it: the Parent Support provider who has a
--      Calendly page is assigned and the family is told. Only then can the
--      family see the Calendly page, on their request, to pick a time.
--      Or the administrator declines it with a reason.
--   3. After the session the administrator marks the request completed.
-- Instant in-app booking of Parent Support ends, and the Calendly page is no
-- longer handed out publicly.

-- 1. Families request a session ---------------------------------------------------------

create function public.request_parent_support(
  input_dependent_id uuid,
  input_description text,
  input_language text,
  input_idempotency_key uuid
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
    preferred_language, delivery_method, status, payment_status, idempotency_key
  ) values (
    target_household, input_dependent_id, target_service.id, 'parent_support', current_user_id,
    btrim(coalesce(input_description, '')), input_language, 'remote', 'pending_review', 'not_required',
    input_idempotency_key
  ) returning id into created_id;

  insert into public.service_request_activities (service_request_id, activity_type)
  values (created_id, 'consultation_session');

  perform private.record_request_event(created_id, 'request_created', null, 'pending_review');
  perform private.notify_request_household(created_id, 'request_received');
  perform private.notify_request_administrators(created_id, 'admin_new_request');
  return created_id;
end;
$$;

-- 2. Administrators approve ---------------------------------------------------------------

-- The Parent Support provider taking bookings with a Calendly page, preferring
-- one who holds sessions in the requested language.
create function private.parent_support_provider(input_language text)
returns uuid
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
    )
  order by exists (
      select 1 from public.specialist_capabilities as capability
      where capability.specialist_id = specialist.id and capability.service_type = 'parent_support'
        and capability.language = input_language
    ) desc,
    specialist.created_at, specialist.id
  limit 1;
$$;

create function public.admin_approve_parent_support(target_request_id uuid, expected_version integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.service_requests%rowtype;
  provider uuid;
begin
  request := private.lock_request_for_staff(target_request_id, false);
  perform private.assert_version(request, expected_version);
  if request.service_type <> 'parent_support' or request.status <> 'pending_review' then
    raise exception 'Only a Parent Support request waiting for approval can be approved.' using errcode = '55000';
  end if;
  provider := private.parent_support_provider(request.preferred_language);
  if provider is null then
    raise exception 'No Parent Support provider has a Calendly link and is taking bookings.' using errcode = 'ES428';
  end if;
  update public.service_requests set specialist_id = provider where id = request.id;
  perform private.set_request_status(request.id, 'assigned', 'parent_support_approved',
    jsonb_build_object('specialist_id', provider));
  perform private.notify_request_household(request.id, 'parent_support_approved');
  perform private.notify_request_specialist(request.id, 'specialist_new_assignment');
  return provider;
end;
$$;

-- 3. Administrators close the request after the session ----------------------------------

create function public.admin_complete_parent_support(target_request_id uuid, expected_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request public.service_requests%rowtype;
begin
  request := private.lock_request_for_staff(target_request_id, false);
  perform private.assert_version(request, expected_version);
  if request.service_type <> 'parent_support' or request.status <> 'assigned' then
    raise exception 'Only an approved Parent Support request can be completed.' using errcode = '55000';
  end if;
  -- Status and completion time change together (service_requests_completion_shape).
  update public.service_requests
  set status = 'completed', completed_at = now(), version = version + 1, updated_at = now()
  where id = request.id;
  perform private.record_request_event(request.id, 'service_completed', request.status, 'completed');
end;
$$;

-- 4. The family's Calendly page, once approved --------------------------------------------

create function public.get_parent_support_calendly_link(target_request_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select specialist.booking_page_url
  from public.service_requests as request
  join public.specialists as specialist on specialist.id = request.specialist_id
  where request.id = target_request_id
    and request.service_type = 'parent_support'
    and request.status = 'assigned'
    and (request.household_id = private.current_household_id() or private.is_current_user_administrator());
$$;

-- 5. Free requests can be declined too -----------------------------------------------------

do $$
declare
  definition text := pg_get_functiondef('public.admin_decline_service_request(uuid, text, integer)'::regprocedure);
  widened text := replace(definition,
    'request.payment_status not in (''unpaid'', ''failed'')',
    'request.payment_status not in (''unpaid'', ''failed'', ''not_required'')');
begin
  if widened = definition then
    raise exception 'admin_decline_service_request changed; update this migration.';
  end if;
  execute widened;
end;
$$;

-- 6. No instant booking of Parent Support; it is requested above ---------------------------

do $$
declare
  definition text := pg_get_functiondef(
    'public.book_service_slot(text, uuid, text, text, uuid, timestamptz, text, uuid, text, text, text)'::regprocedure);
  narrowed text := replace(definition,
    'where service_type = input_service_type and active and self_scheduled;',
    'where service_type = input_service_type and active and self_scheduled and service_type <> ''parent_support'';');
begin
  if narrowed = definition then
    raise exception 'book_service_slot changed; update this migration.';
  end if;
  execute narrowed;
end;
$$;

-- The Calendly page is only shown to families whose request was approved.
revoke all on function public.get_parent_support_booking_page() from anon, authenticated;

revoke all on function public.request_parent_support(uuid, text, text, uuid) from public, anon;
grant execute on function public.request_parent_support(uuid, text, text, uuid) to authenticated;
revoke all on function private.parent_support_provider(text) from public, anon, authenticated;
revoke all on function public.admin_approve_parent_support(uuid, integer) from public, anon;
grant execute on function public.admin_approve_parent_support(uuid, integer) to authenticated;
revoke all on function public.admin_complete_parent_support(uuid, integer) from public, anon;
grant execute on function public.admin_complete_parent_support(uuid, integer) to authenticated;
revoke all on function public.get_parent_support_calendly_link(uuid) from public, anon;
grant execute on function public.get_parent_support_calendly_link(uuid) to authenticated;
