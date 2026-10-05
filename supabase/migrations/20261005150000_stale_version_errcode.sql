-- PostgREST automatically retries SQLSTATE 40001 (serialization_failure), so
-- raising it for a stale expected_version made the same doomed call retry
-- forever. Stale-version conflicts now use ES412, which the app maps to the
-- same stale-version messages it showed for 40001.

CREATE OR REPLACE FUNCTION private.assert_version(request service_requests, expected_version integer)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if expected_version is not null and request.version <> expected_version then
    raise exception 'This request changed; refresh and try again.' using errcode = 'ES412';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.transition_support_request(target_thread_id uuid, expected_version integer, next_status text)
 RETURNS TABLE(id uuid, version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'This support request was updated elsewhere.' using errcode = 'ES412';
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
$function$;

CREATE OR REPLACE FUNCTION public.accept_support_appointment(target_appointment_id uuid, expected_version integer, input_consent_copy_version text, input_acknowledged boolean)
 RETURNS TABLE(id uuid, version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'This appointment was updated elsewhere.' using errcode = 'ES412';
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_service(target_service_id uuid, expected_version integer, input_name text, input_description text, input_localized jsonb, input_included_follow_ups integer, input_standard_instructions jsonb, input_active boolean, input_price_cents integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare next_version integer;
begin
  perform private.require_administrator();
  update public.services
  set name = btrim(input_name),
      description = btrim(input_description),
      localized = coalesce(input_localized, '{}'::jsonb),
      price_cents = case when payment_type = 'recurring_monthly' then input_price_cents else coalesce(input_price_cents, price_cents) end,
      included_follow_ups = coalesce(input_included_follow_ups, included_follow_ups),
      standard_instructions = coalesce(input_standard_instructions, '{}'::jsonb),
      active = coalesce(input_active, active),
      version = version + 1,
      updated_at = now()
  where id = target_service_id and version = expected_version
  returning version into next_version;
  if next_version is null then
    raise exception 'The service changed; refresh and try again.' using errcode = 'ES412';
  end if;
  return next_version;
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_resource_translation(target_translation_id uuid, expected_version integer)
 RETURNS TABLE(translation_id uuid, translation_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); translation public.resource_translations%rowtype; english_version integer; new_version integer;
begin
  select * into translation from public.resource_translations where id=target_translation_id for update;
  if not found or translation.locale not in ('am','es') then raise exception 'Translation is unavailable.' using errcode='42501'; end if;
  if translation.version<>expected_version then raise exception 'Translation is stale.' using errcode='ES412'; end if;
  if translation.review_status<>'in_review' or translation.submitted_by=actor then raise exception 'Translation review is unavailable.' using errcode='42501'; end if;
  english_version:=private.require_translation_context(translation.resource_id);
  if translation.source_translation_version<>english_version then raise exception 'English source changed.' using errcode='ES412'; end if;
  update public.resource_translations set review_status='approved',reviewed_by=actor,reviewed_at=now(),review_note=null,updated_by=actor,version=version+1 where id=translation.id returning version into new_version;
  insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,from_review_status,to_review_status,translation_version,source_translation_version)
    values(translation.resource_id,translation.id,translation.locale,actor,'approved','in_review','approved',new_version,english_version);
  return query select translation.id,new_version;
end;
$function$;

CREATE OR REPLACE FUNCTION public.archive_roadmap_item(target_item_id uuid, expected_updated_at timestamp with time zone)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing_item public.roadmap_items%rowtype;
  current_permission public.household_permission;
begin
  select item.* into existing_item from public.roadmap_items as item where item.id = target_item_id for update;
  if not found then
    raise exception 'Roadmap item is unavailable.' using errcode = '42501';
  end if;
  current_permission := private.current_roadmap_permission(existing_item.household_id);
  if current_permission not in ('owner', 'administrator') then
    raise exception 'Roadmap archive is unavailable.' using errcode = '42501';
  end if;
  if existing_item.archived_at is not null then
    return query select existing_item.id, existing_item.updated_at;
    return;
  end if;
  if expected_updated_at is null or existing_item.updated_at is distinct from expected_updated_at then
    raise exception 'Roadmap item is stale.' using errcode = 'ES412';
  end if;
  update public.roadmap_items as item
  set archived_at = now()
  where item.id = existing_item.id
  returning item.id, item.updated_at into id, updated_at;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_specialist_to_support_request(target_thread_id uuid, target_specialist_id uuid, expected_assignment_version integer)
 RETURNS TABLE(id uuid, assignment_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  existing_thread public.support_threads%rowtype;
  next_version integer;
begin
  if not private.is_current_user_administrator() then
    raise exception 'Specialist assignment is unavailable.' using errcode = '42501';
  end if;

  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = target_thread_id
  for update;
  if not found then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;
  if existing_thread.status <> 'open' then
    raise exception 'A closed or cancelled support request cannot be assigned.' using errcode = '55000';
  end if;
  -- Version before duplicate detection, so a concurrent assignment reports the
  -- stale state the caller must refresh rather than a bare conflict.
  if expected_assignment_version is null
    or existing_thread.assignment_version is distinct from expected_assignment_version then
    raise exception 'This specialist assignment was updated elsewhere.' using errcode = 'ES412';
  end if;
  if existing_thread.specialist_id is not null then
    raise exception 'This support request already has an assigned specialist.' using errcode = '23505';
  end if;
  if target_specialist_id is null or not private.is_eligible_specialist(target_specialist_id) then
    raise exception 'This specialist cannot be assigned.' using errcode = '22023';
  end if;

  next_version := existing_thread.assignment_version + 1;

  insert into private.support_assignment_markers (thread_id, transaction_id)
  values (existing_thread.id, txid_current())
  on conflict do nothing;

  update public.support_threads as thread
  set
    specialist_id = target_specialist_id,
    specialist_assigned_at = now(),
    specialist_assigned_by = current_user_id,
    assignment_version = next_version,
    assignment_updated_at = now()
  where thread.id = existing_thread.id;

  delete from private.support_assignment_markers as marker
  where marker.thread_id = existing_thread.id and marker.transaction_id = txid_current();

  insert into public.support_request_assignment_events (
    thread_id, household_id, specialist_id, actor_user_id, action, assignment_version, reason, safe_metadata
  ) values (
    existing_thread.id, existing_thread.household_id, target_specialist_id, current_user_id,
    'assigned', next_version, null,
    jsonb_build_object('category', existing_thread.category, 'preferred_language', existing_thread.preferred_language)
  );

  return query select existing_thread.id, next_version;
end;
$function$;

CREATE OR REPLACE FUNCTION public.attach_service_payment_session(target_payment_id uuid, input_session_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Payment operation is unavailable.' using errcode = '42501';
  end if;
  update public.service_payments
  set provider_checkout_session_id = input_session_id, updated_at = now()
  where id = target_payment_id and status = 'pending' and provider_checkout_session_id is null;
  if not found then
    raise exception 'Payment is unavailable.' using errcode = 'ES412';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_personal_reminder(target_reminder_id uuid, expected_updated_at timestamp with time zone)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare reminder public.reminders%rowtype;
begin
  select * into reminder from public.reminders where reminders.id=target_reminder_id for update;
  if not found or reminder.user_id <> auth.uid() or not private.is_active_household_member(reminder.household_id) then raise exception 'Reminder is unavailable.' using errcode='42501'; end if;
  if reminder.status='cancelled' then return query select reminder.id, reminder.updated_at; return; end if;
  if reminder.status <> 'scheduled' then raise exception 'Reminder cannot be cancelled.' using errcode='22023'; end if;
  if reminder.updated_at is distinct from expected_updated_at then raise exception 'Reminder is stale.' using errcode='ES412'; end if;
  update public.reminders set status='cancelled', cancelled_at=now(), cancellation_reason='recipient_cancelled', consented_at=null where reminders.id=reminder.id returning reminders.id, reminders.updated_at into id,updated_at;
  insert into public.reminder_delivery_logs(reminder_id,household_id,recipient_user_id,roadmap_item_id,attempt_number,status,scheduled_for_utc,completed_at,roadmap_title_snapshot)
  select reminder.id,reminder.household_id,reminder.user_id,reminder.roadmap_item_id, greatest(reminder.attempt_count,1),'cancelled',reminder.scheduled_for_utc,now(),item.title from public.roadmap_items item where item.id=reminder.roadmap_item_id;
  return next;
end; $function$;

CREATE OR REPLACE FUNCTION public.cancel_support_appointment(target_appointment_id uuid, expected_version integer, input_reschedule_requested boolean DEFAULT false)
 RETURNS TABLE(id uuid, version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'This appointment was updated elsewhere.' using errcode = 'ES412';
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
$function$;

CREATE OR REPLACE FUNCTION public.complete_stripe_webhook_event(input_stripe_event_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Webhook operation is unavailable.' using errcode = '42501';
  end if;
  update public.stripe_webhook_events
    set processing_status = 'processed', processed_at = now(), last_error_code = null, updated_at = now()
    where stripe_event_id = input_stripe_event_id and processing_status = 'processing';
  if not found then raise exception 'Webhook event is unavailable.' using errcode = 'ES412'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_support_appointment(target_appointment_id uuid, expected_version integer)
 RETURNS TABLE(id uuid, version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'This appointment was updated elsewhere.' using errcode = 'ES412';
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
$function$;

CREATE OR REPLACE FUNCTION public.decline_support_appointment(target_appointment_id uuid, expected_version integer)
 RETURNS TABLE(id uuid, version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'This appointment was updated elsewhere.' using errcode = 'ES412';
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
$function$;

CREATE OR REPLACE FUNCTION public.link_household_billing_customer(target_household_id uuid, target_actor_id uuid, input_stripe_customer_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare existing_customer public.billing_customers%rowtype;
begin
  if auth.role() <> 'service_role'
    or not (
      private.household_user_can(target_household_id, target_actor_id, 'manage_subscription')
      or private.household_user_can(target_household_id, target_actor_id, 'make_payments')
    ) then
    raise exception 'Billing operation is unavailable.' using errcode = '42501';
  end if;
  select * into existing_customer from public.billing_customers where household_id = target_household_id for update;
  if existing_customer.id is not null then
    if existing_customer.stripe_customer_id <> input_stripe_customer_id then
      raise exception 'Billing customer conflict.' using errcode = 'ES412';
    end if;
    return;
  end if;
  insert into public.billing_customers (household_id, stripe_customer_id)
  values (target_household_id, input_stripe_customer_id);
  insert into public.billing_events (household_id, actor_user_id, action)
  values (target_household_id, target_actor_id, 'customer_linked');
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_resource_translation(target_translation_id uuid, expected_version integer, input_rejection_note text)
 RETURNS TABLE(translation_id uuid, translation_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); translation public.resource_translations%rowtype; english_version integer; new_version integer;
begin
  select * into translation from public.resource_translations where id=target_translation_id for update;
  if not found or translation.locale not in ('am','es') then raise exception 'Translation is unavailable.' using errcode='42501'; end if;
  if translation.version<>expected_version then raise exception 'Translation is stale.' using errcode='ES412'; end if;
  if translation.review_status<>'in_review' or translation.submitted_by=actor then raise exception 'Translation review is unavailable.' using errcode='42501'; end if;
  if char_length(btrim(coalesce(input_rejection_note,''))) not between 10 and 1000 then raise exception 'Rejection note is invalid.' using errcode='22023'; end if;
  english_version:=private.require_translation_context(translation.resource_id);
  update public.resource_translations set review_status='draft',reviewed_by=actor,reviewed_at=now(),review_note=btrim(input_rejection_note),updated_by=actor,version=version+1 where id=translation.id returning version into new_version;
  insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,from_review_status,to_review_status,translation_version,source_translation_version)
    values(translation.resource_id,translation.id,translation.locale,actor,'rejected','in_review','draft',new_version,english_version);
  return query select translation.id,new_version;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_roadmap_items(target_item_id uuid, expected_updated_at timestamp with time zone, input_direction text)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_item public.roadmap_items%rowtype;
  adjacent_item public.roadmap_items%rowtype;
  current_permission public.household_permission;
begin
  if input_direction not in ('up', 'down') then
    raise exception 'Roadmap reorder direction is invalid.' using errcode = '22023';
  end if;
  select item.* into current_item from public.roadmap_items as item where item.id = target_item_id for update;
  if not found then
    raise exception 'Roadmap item is unavailable.' using errcode = '42501';
  end if;
  current_permission := private.current_roadmap_permission(current_item.household_id);
  if current_permission not in ('owner', 'administrator') then
    raise exception 'Roadmap reorder is unavailable.' using errcode = '42501';
  end if;
  if current_item.archived_at is not null then
    raise exception 'Archived roadmap items cannot be reordered.' using errcode = '22023';
  end if;
  if expected_updated_at is null or current_item.updated_at is distinct from expected_updated_at then
    raise exception 'Roadmap item is stale.' using errcode = 'ES412';
  end if;

  if input_direction = 'up' then
    select item.* into adjacent_item
    from public.roadmap_items as item
    where item.household_id = current_item.household_id
      and item.archived_at is null
      and (item.sort_order, item.id) < (current_item.sort_order, current_item.id)
    order by item.sort_order desc, item.id desc
    limit 1
    for update;
  else
    select item.* into adjacent_item
    from public.roadmap_items as item
    where item.household_id = current_item.household_id
      and item.archived_at is null
      and (item.sort_order, item.id) > (current_item.sort_order, current_item.id)
    order by item.sort_order asc, item.id asc
    limit 1
    for update;
  end if;

  if found then
    update public.roadmap_items as item
    set sort_order = current_item.sort_order
    where item.id = adjacent_item.id;
    update public.roadmap_items as item
    set sort_order = adjacent_item.sort_order
    where item.id = current_item.id
    returning item.id, item.updated_at into id, updated_at;
  else
    id := current_item.id;
    updated_at := current_item.updated_at;
  end if;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_roadmap_item(target_item_id uuid, expected_updated_at timestamp with time zone)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing_item public.roadmap_items%rowtype;
  current_permission public.household_permission;
begin
  select item.* into existing_item from public.roadmap_items as item where item.id = target_item_id for update;
  if not found then
    raise exception 'Roadmap item is unavailable.' using errcode = '42501';
  end if;
  current_permission := private.current_roadmap_permission(existing_item.household_id);
  if current_permission not in ('owner', 'administrator') then
    raise exception 'Roadmap restore is unavailable.' using errcode = '42501';
  end if;
  if existing_item.archived_at is null then
    return query select existing_item.id, existing_item.updated_at;
    return;
  end if;
  if expected_updated_at is null or existing_item.updated_at is distinct from expected_updated_at then
    raise exception 'Roadmap item is stale.' using errcode = 'ES412';
  end if;
  update public.roadmap_items as item
  set archived_at = null
  where item.id = existing_item.id
  returning item.id, item.updated_at into id, updated_at;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_specialist_from_support_request(target_thread_id uuid, expected_assignment_version integer)
 RETURNS TABLE(id uuid, assignment_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing_thread public.support_threads%rowtype;
  next_version integer;
begin
  if not private.is_current_user_administrator() then
    raise exception 'Specialist revocation is unavailable.' using errcode = '42501';
  end if;

  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = target_thread_id
  for update;
  if not found then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;
  -- Version first: a mismatch means the assignment changed under this caller
  -- (another revocation, or an automatic revocation on close), which is the
  -- stale case rather than a request that never had a specialist.
  if expected_assignment_version is null
    or existing_thread.assignment_version is distinct from expected_assignment_version then
    raise exception 'This specialist assignment was updated elsewhere.' using errcode = 'ES412';
  end if;
  if existing_thread.specialist_id is null then
    raise exception 'This support request has no assigned specialist.' using errcode = '55000';
  end if;

  next_version := private.revoke_support_request_specialist(
    existing_thread, auth.uid(), 'administrator_revoked'
  );
  return query select existing_thread.id, next_version;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_resource_account_access(target_resource_id uuid, expected_version integer, input_user_ids uuid[])
 RETURNS TABLE(resource_id uuid, resource_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); resource public.resources%rowtype; requested_count integer;
begin
  if not private.can_manage_resources() then raise exception 'Resource access is unavailable.' using errcode='42501'; end if;
  select * into resource from public.resources r where r.id=target_resource_id for update;
  if not found or resource.version<>expected_version then raise exception 'Resource is stale.' using errcode='ES412'; end if;
  select count(distinct value) into requested_count from unnest(coalesce(input_user_ids,array[]::uuid[])) value;
  if requested_count=0 or requested_count<>(select count(*) from public.profiles where id=any(input_user_ids)) then raise exception 'Select at least one valid account.' using errcode='22023'; end if;
  delete from public.resource_account_access as access where access.resource_id=resource.id;
  insert into public.resource_account_access(resource_id,user_id,assigned_by) select resource.id, value, actor from unnest(input_user_ids) value on conflict do nothing;
  update public.resources set version=version+1,updated_by=actor where id=resource.id returning version into resource_version;
  resource_id:=resource.id; return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_resource_translation(target_translation_id uuid, expected_version integer)
 RETURNS TABLE(translation_id uuid, translation_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); translation public.resource_translations%rowtype; english_version integer; new_version integer;
begin
  select * into translation from public.resource_translations where id=target_translation_id for update;
  if not found or translation.locale not in ('am','es') then raise exception 'Translation is unavailable.' using errcode='42501'; end if;
  if translation.version<>expected_version then raise exception 'Translation is stale.' using errcode='ES412'; end if;
  if translation.review_status<>'draft' then raise exception 'Translation transition is invalid.' using errcode='22023'; end if;
  perform private.validate_resource_translation_content(translation.title,translation.summary,translation.body);
  english_version:=private.require_translation_context(translation.resource_id);
  if translation.source_translation_version<>english_version then raise exception 'English source changed.' using errcode='ES412'; end if;
  update public.resource_translations set review_status='in_review',submitted_by=actor,submitted_at=now(),updated_by=actor,version=version+1 where id=translation.id returning version into new_version;
  insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,from_review_status,to_review_status,translation_version,source_translation_version)
    values(translation.resource_id,translation.id,translation.locale,actor,'submitted','draft','in_review',new_version,english_version);
  return query select translation.id,new_version;
end;
$function$;

CREATE OR REPLACE FUNCTION public.transition_resource(target_resource_id uuid, expected_version integer, input_action text, input_rejection_note text DEFAULT NULL::text)
 RETURNS TABLE(resource_id uuid, resource_version integer, resource_status resource_status)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); current_resource public.resources%rowtype; english public.resource_translations%rowtype; next_status public.resource_status; next_review text; audit_action text; new_version integer; result_status public.resource_status;
begin
  if not private.can_manage_resources() then raise exception 'Resource access is unavailable.' using errcode='42501'; end if;
  select * into current_resource from public.resources r where r.id=target_resource_id for update;
  if not found or current_resource.version<>expected_version then raise exception 'Resource is stale.' using errcode='ES412'; end if;
  select * into english from public.resource_translations t where t.resource_id=target_resource_id and t.locale='en' for update;
  if not found then raise exception 'Canonical resource content is unavailable.' using errcode='22023'; end if;
  if input_action in ('submit','publish') then perform private.validate_resource_content(current_resource.slug,current_resource.category,english.title,english.summary,english.body); end if;
  if input_action='submit' and current_resource.status='draft' then next_status:='in_review'; next_review:='in_review'; audit_action:='submitted';
  elsif input_action='withdraw' and current_resource.status='in_review' then next_status:='draft'; next_review:='draft'; audit_action:='withdrawn';
  elsif input_action='approve' and current_resource.status='in_review' and english.review_status='in_review' then next_status:='in_review'; next_review:='approved'; audit_action:='approved';
  elsif input_action='reject' and current_resource.status='in_review' and english.review_status='in_review' and current_resource.updated_by<>actor and char_length(btrim(coalesce(input_rejection_note,''))) between 10 and 1000 then next_status:='draft'; next_review:='draft'; audit_action:='rejected';
  elsif input_action='publish' and current_resource.status='in_review' and english.review_status='approved' then next_status:='published'; next_review:='approved'; audit_action:='published';
  elsif input_action='unpublish' and current_resource.status='published' then next_status:='draft'; next_review:='draft'; audit_action:='unpublished';
  elsif input_action='archive' and current_resource.status in ('draft','in_review','published') then next_status:='archived'; next_review:=english.review_status; audit_action:='archived';
  elsif input_action='restore' and current_resource.status='archived' then next_status:='draft'; next_review:='draft'; audit_action:='restored';
  else raise exception 'Resource transition is invalid.' using errcode='22023'; end if;
  update public.resources set status=next_status,version=version+1,updated_by=actor,
    published_by=case when audit_action='published' then actor when audit_action='unpublished' then null else published_by end,
    published_at=case when audit_action='published' then now() when audit_action='unpublished' then null else published_at end,
    first_published_at=case when audit_action='published' then coalesce(first_published_at,now()) else first_published_at end,
    archived_by=case when audit_action='archived' then actor when audit_action='restored' then null else archived_by end,
    archived_at=case when audit_action='archived' then now() when audit_action='restored' then null else archived_at end
    where id=current_resource.id returning version,status into new_version,result_status;
  update public.resource_translations as translation set review_status=next_review,
    reviewed_by=case when audit_action in ('approved','rejected') then actor when audit_action in ('unpublish','restore','withdraw') then null else translation.reviewed_by end,
    reviewed_at=case when audit_action in ('approved','rejected') then now() when audit_action in ('unpublish','restore','withdraw') then null else translation.reviewed_at end,
    review_note=case when audit_action='rejected' then btrim(input_rejection_note) when audit_action in ('unpublish','restore','withdraw') then null else translation.review_note end
    where translation.resource_id=current_resource.id and translation.locale='en';
  insert into public.resource_audit_events(resource_id,actor_user_id,action,from_status,to_status,resource_version,safe_metadata)
    values(current_resource.id,actor,audit_action,current_resource.status,result_status,new_version,case when audit_action='rejected' then jsonb_build_object('rejection_note',btrim(input_rejection_note)) else '{}'::jsonb end);
  return query select current_resource.id,new_version,result_status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_personal_reminder(target_reminder_id uuid, expected_schedule_version integer, input_offset_days integer, input_local_time time without time zone, input_timezone text, input_scheduled_local_date date, input_scheduled_for_utc timestamp with time zone, input_timezone_offset_minutes integer)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone, schedule_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  reminder public.reminders%rowtype;
  item public.roadmap_items%rowtype;
begin
  select * into reminder from public.reminders as candidate where candidate.id = target_reminder_id for update;
  if not found
    or reminder.user_id <> auth.uid()
    or reminder.status <> 'scheduled'
    or not private.is_active_household_member(reminder.household_id) then
    raise exception 'Reminder is unavailable.' using errcode = '42501';
  end if;
  if reminder.schedule_version <> expected_schedule_version then
    raise exception 'Reminder is stale.' using errcode = 'ES412';
  end if;
  select * into item from public.roadmap_items as candidate where candidate.id = reminder.roadmap_item_id;
  if not found
    or item.household_id is distinct from reminder.household_id
    or item.archived_at is not null
    or item.due_date is null
    or item.status in ('completed', 'cancelled') then
    raise exception 'Reminder item is unavailable.' using errcode = '42501';
  end if;
  if input_offset_days not in (0, 1, 3, 7)
    or input_timezone !~ '^[A-Za-z_]+/[A-Za-z_]+(?:/[A-Za-z_]+)?$'
    or input_scheduled_local_date <> item.due_date - input_offset_days
    or input_scheduled_for_utc <= now() + interval '5 minutes' then
    raise exception 'Reminder schedule is unavailable.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.reminders as other_reminder
    where other_reminder.roadmap_item_id = reminder.roadmap_item_id
      and other_reminder.user_id = reminder.user_id
      and other_reminder.id <> reminder.id
      and other_reminder.status in ('scheduled', 'processing')
      and other_reminder.offset_days = input_offset_days
      and other_reminder.scheduled_local_time = input_local_time
      and other_reminder.timezone = input_timezone
  ) then
    raise exception 'Reminder schedule already exists.' using errcode = '23505';
  end if;
  update public.reminders as candidate
  set
    offset_days = input_offset_days,
    scheduled_local_date = input_scheduled_local_date,
    scheduled_local_time = input_local_time,
    timezone = input_timezone,
    timezone_offset_minutes = input_timezone_offset_minutes,
    scheduled_for_utc = input_scheduled_for_utc,
    next_attempt_at = input_scheduled_for_utc,
    schedule_version = candidate.schedule_version + 1,
    attempt_count = 0,
    locked_at = null,
    locked_by = null
  where candidate.id = reminder.id
  returning candidate.id, candidate.updated_at, candidate.schedule_version into id, updated_at, schedule_version;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_resource_discovery_metadata(target_resource_id uuid, expected_version integer, input_resource_type text, input_featured_rank integer DEFAULT NULL::integer)
 RETURNS TABLE(resource_id uuid, resource_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  current_resource public.resources%rowtype;
begin
  if not private.can_manage_resources() then
    raise exception 'Resource management is unavailable.' using errcode = '42501';
  end if;
  if input_resource_type not in ('article', 'guide', 'video', 'template', 'event_recap')
    or (input_featured_rank is not null and (input_featured_rank < 1 or input_featured_rank > 1000)) then
    raise exception 'Resource discovery metadata is invalid.' using errcode = '22023';
  end if;

  select * into current_resource
  from public.resources as resource
  where resource.id = target_resource_id
  for update;

  if not found or expected_version is null or current_resource.version <> expected_version then
    raise exception 'Resource is stale.' using errcode = 'ES412';
  end if;

  update public.resources as resource
  set resource_type = input_resource_type,
      featured_rank = input_featured_rank,
      version = resource.version + 1,
      updated_by = actor
  where resource.id = current_resource.id
  returning resource.id, resource.version into resource_id, resource_version;

  insert into public.resource_audit_events(
    resource_id,
    actor_user_id,
    action,
    from_status,
    to_status,
    resource_version,
    safe_metadata
  ) values (
    current_resource.id,
    actor,
    'discovery_metadata_updated',
    current_resource.status,
    current_resource.status,
    resource_version,
    jsonb_build_object('resource_type', input_resource_type, 'featured_rank', input_featured_rank)
  );

  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_resource_draft(target_resource_id uuid, expected_version integer, input_slug text, input_category text, input_title text, input_summary text, input_body text)
 RETURNS TABLE(resource_id uuid, resource_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); current_resource public.resources%rowtype; english public.resource_translations%rowtype; updated_version integer; content_changed boolean;
begin
  if not private.can_manage_resources() then raise exception 'Resource access is unavailable.' using errcode='42501'; end if;
  select * into current_resource from public.resources r where r.id=target_resource_id for update;
  if not found or current_resource.status<>'draft' then raise exception 'Resource is unavailable.' using errcode='42501'; end if;
  if current_resource.version<>expected_version then raise exception 'Resource is stale.' using errcode='ES412'; end if;
  if current_resource.first_published_at is not null and btrim(input_slug)<>current_resource.slug then raise exception 'Published resource slugs are immutable.' using errcode='22023'; end if;
  perform private.validate_resource_content(btrim(input_slug),input_category,btrim(input_title),btrim(input_summary),btrim(input_body));
  select * into english from public.resource_translations as translation where translation.resource_id=current_resource.id and translation.locale='en' for update;
  if not found then raise exception 'Canonical resource content is unavailable.' using errcode='22023'; end if;
  content_changed := btrim(input_title)<>english.title or btrim(input_summary)<>english.summary or btrim(input_body)<>english.body;
  update public.resources set slug=btrim(input_slug),category=input_category,updated_by=actor,version=version+1 where id=current_resource.id returning version into updated_version;
  if content_changed then
    update public.resource_translations as translation set title=btrim(input_title),summary=btrim(input_summary),body=btrim(input_body),review_status='draft',reviewed_by=null,reviewed_at=null,review_note=null,updated_by=actor,version=version+1
      where translation.resource_id=current_resource.id and translation.locale='en';
    perform private.invalidate_resource_translations_for_source_change(current_resource.id,actor);
  end if;
  insert into public.resource_audit_events(resource_id,actor_user_id,action,from_status,to_status,resource_version,safe_metadata)
    values(current_resource.id,actor,'updated','draft','draft',updated_version,jsonb_build_object('fields',case when content_changed then array['slug','category','english_content'] else array['slug','category'] end));
  return query select current_resource.id, updated_version;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_resource_translation_draft(target_translation_id uuid, expected_version integer, input_title text, input_summary text, input_body text)
 RETURNS TABLE(translation_id uuid, translation_version integer, source_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); translation public.resource_translations%rowtype; english_version integer; new_version integer;
begin
  select * into translation from public.resource_translations where id=target_translation_id for update;
  if not found or translation.locale not in ('am','es') then raise exception 'Translation is unavailable.' using errcode='42501'; end if;
  if translation.version<>expected_version then raise exception 'Translation is stale.' using errcode='ES412'; end if;
  if translation.review_status<>'draft' then raise exception 'Translation transition is invalid.' using errcode='22023'; end if;
  perform private.validate_resource_translation_content(input_title,input_summary,input_body);
  english_version:=private.require_translation_context(translation.resource_id);
  update public.resource_translations set title=btrim(input_title),summary=btrim(input_summary),body=btrim(input_body),source_translation_version=english_version,
    submitted_by=null,submitted_at=null,reviewed_by=null,reviewed_at=null,review_note=null,updated_by=actor,version=version+1 where id=translation.id returning version into new_version;
  insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,from_review_status,to_review_status,translation_version,source_translation_version)
    values(translation.resource_id,translation.id,translation.locale,actor,'updated','draft','draft',new_version,english_version);
  return query select translation.id,new_version,english_version;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_roadmap_item(target_item_id uuid, expected_updated_at timestamp with time zone, input_title text, input_description text DEFAULT NULL::text, input_category text DEFAULT 'general'::text, input_priority text DEFAULT 'medium'::text, input_status text DEFAULT 'not_started'::text, input_due_date date DEFAULT NULL::date, input_dependent_id uuid DEFAULT NULL::uuid, input_assigned_to uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  current_permission public.household_permission;
  existing_item public.roadmap_items%rowtype;
begin
  select item.* into existing_item
  from public.roadmap_items as item
  where item.id = target_item_id
  for update;
  if not found then
    raise exception 'Roadmap item is unavailable.' using errcode = '42501';
  end if;

  current_permission := private.current_roadmap_permission(existing_item.household_id);
  if current_permission is null
    or (current_permission = 'viewer')
    or (current_permission = 'member' and existing_item.created_by <> current_user_id and existing_item.assigned_to <> current_user_id) then
    raise exception 'Roadmap item update is unavailable.' using errcode = '42501';
  end if;
  if existing_item.archived_at is not null then
    raise exception 'Archived roadmap items must be restored first.' using errcode = '22023';
  end if;
  if expected_updated_at is null or existing_item.updated_at is distinct from expected_updated_at then
    raise exception 'Roadmap item is stale.' using errcode = 'ES412';
  end if;
  if input_category not in ('general', 'healthcare', 'education', 'therapy', 'benefits', 'legal', 'family_support', 'other')
    or input_priority not in ('low', 'medium', 'high')
    or input_status not in ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled') then
    raise exception 'Roadmap item values are invalid.' using errcode = '22023';
  end if;
  if input_status <> existing_item.status
    and not private.roadmap_status_transition_allowed(existing_item.status, input_status) then
    raise exception 'Roadmap status transition is invalid.' using errcode = '22023';
  end if;
  if current_permission = 'member' and input_assigned_to is not null and input_assigned_to <> current_user_id then
    raise exception 'Roadmap member assignment is invalid.' using errcode = '42501';
  end if;

  update public.roadmap_items as item
  set
    title = btrim(input_title),
    description = nullif(btrim(input_description), ''),
    category = input_category,
    priority = input_priority,
    status = input_status,
    due_date = input_due_date,
    dependent_id = input_dependent_id,
    assigned_to = input_assigned_to,
    completed_at = case
      when input_status = 'completed' then coalesce(existing_item.completed_at, now())
      else null
    end
  where item.id = existing_item.id
  returning item.id, item.updated_at into id, updated_at;

  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_roadmap_item_and_reschedule_reminders(target_item_id uuid, expected_updated_at timestamp with time zone, input_title text, input_description text DEFAULT NULL::text, input_category text DEFAULT NULL::text, input_priority text DEFAULT NULL::text, input_status text DEFAULT NULL::text, input_due_date date DEFAULT NULL::date, input_dependent_id uuid DEFAULT NULL::uuid, input_assigned_to uuid DEFAULT NULL::uuid, input_reminder_schedules jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare schedule jsonb; reminder public.reminders%rowtype; updated_item record; item_title text;
begin
  if jsonb_typeof(input_reminder_schedules) <> 'array' then raise exception 'Reminder schedules are invalid.' using errcode='22023'; end if;
  select * into updated_item from public.update_roadmap_item(target_item_id, expected_updated_at, input_title, input_description, input_category, input_priority, input_status, input_due_date, input_dependent_id, input_assigned_to);
  for reminder in select candidate.* from public.reminders as candidate where candidate.roadmap_item_id=target_item_id and candidate.status='scheduled' for update loop
    select value into schedule from jsonb_array_elements(input_reminder_schedules) where value->>'id'=reminder.id::text;
    if schedule is null or coalesce((schedule->>'expectedScheduleVersion')::integer,0) <> reminder.schedule_version then raise exception 'Reminder schedule is stale.' using errcode='ES412'; end if;
    select item.title into item_title from public.roadmap_items as item where item.id=target_item_id;
    if schedule->>'kind'='cancelled' then
      update public.reminders as candidate set status='cancelled',cancelled_at=now(),cancellation_reason='roadmap_due_date_moved_to_past',next_attempt_at=null,locked_at=null,locked_by=null where candidate.id=reminder.id;
      insert into public.reminder_delivery_logs(reminder_id,household_id,recipient_user_id,roadmap_item_id,attempt_number,status,scheduled_for_utc,completed_at,safe_error_code,roadmap_title_snapshot) values(reminder.id,reminder.household_id,reminder.user_id,target_item_id,greatest(reminder.attempt_count,1),'cancelled',reminder.scheduled_for_utc,now(),'roadmap_due_date_moved_to_past',item_title);
    elsif schedule->>'kind'='rescheduled' then
      update public.reminders as candidate set scheduled_local_date=(schedule->>'scheduledLocalDate')::date,scheduled_for_utc=(schedule->>'scheduledForUtc')::timestamptz,timezone_offset_minutes=(schedule->>'timezoneOffsetMinutes')::integer,schedule_version=candidate.schedule_version+1,attempt_count=0,next_attempt_at=(schedule->>'scheduledForUtc')::timestamptz,locked_at=null,locked_by=null where candidate.id=reminder.id;
      insert into public.reminder_delivery_logs(reminder_id,household_id,recipient_user_id,roadmap_item_id,attempt_number,status,scheduled_for_utc,completed_at,safe_error_code,roadmap_title_snapshot) values(reminder.id,reminder.household_id,reminder.user_id,target_item_id,greatest(reminder.attempt_count,1),'rescheduled',(schedule->>'scheduledForUtc')::timestamptz,now(),null,item_title);
    else raise exception 'Reminder schedules are invalid.' using errcode='22023'; end if;
  end loop;
  return query select updated_item.id,updated_item.updated_at;
end; $function$;

CREATE OR REPLACE FUNCTION public.withdraw_resource_translation(target_translation_id uuid, expected_version integer)
 RETURNS TABLE(translation_id uuid, translation_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); translation public.resource_translations%rowtype; english_version integer; new_version integer;
begin
  select * into translation from public.resource_translations where id=target_translation_id for update;
  if not found or translation.locale not in ('am','es') then raise exception 'Translation is unavailable.' using errcode='42501'; end if;
  if translation.version<>expected_version then raise exception 'Translation is stale.' using errcode='ES412'; end if;
  if translation.review_status<>'in_review' then raise exception 'Translation transition is invalid.' using errcode='22023'; end if;
  english_version:=private.require_translation_context(translation.resource_id);
  update public.resource_translations set review_status='draft',submitted_by=null,submitted_at=null,updated_by=actor,version=version+1 where id=translation.id returning version into new_version;
  insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,from_review_status,to_review_status,translation_version,source_translation_version)
    values(translation.resource_id,translation.id,translation.locale,actor,'withdrawn','in_review','draft',new_version,english_version);
  return query select translation.id,new_version;
end;
$function$;
