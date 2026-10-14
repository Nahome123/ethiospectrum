begin;

select no_plan();

-- Synthetic users only.
--  e1..01 owner (auto-created household)   e1..02 administrator
--  e1..03 assigned specialist               e1..04 another specialist
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'confirm-owner@example.test', 'x', now(), '{}', '{"last_name": "Confirm", "account_intent": "household_owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'confirm-admin@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'confirm-specialist@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'confirm-other-specialist@example.test', 'x', now(), '{}', '{}', now(), now());
update public.user_roles set role = 'administrator' where user_id = 'e1000000-0000-4000-8000-000000000002';

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

create function pg_temp.slot(hours integer) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'local_start', to_char((now() at time zone 'UTC') + make_interval(hours => hours), 'YYYY-MM-DD"T"HH24:MI'),
    'timezone', 'UTC');
$$;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000002';
select public.admin_set_user_role('e1000000-0000-4000-8000-000000000003', 'specialist');
select public.admin_set_user_role('e1000000-0000-4000-8000-000000000004', 'specialist');
insert into ids select 'spec', specialist_id from public.admin_list_specialists() where user_id = 'e1000000-0000-4000-8000-000000000003';
insert into ids select 'other_spec', specialist_id from public.admin_list_specialists() where user_id = 'e1000000-0000-4000-8000-000000000004';
select public.admin_update_specialist((select id from ids where name = 'spec'), 'available', '[{"service_type": "consultation", "language": "en", "delivery_method": "remote"},
    {"service_type": "iep_language_assistance", "language": "am", "delivery_method": "in_person"}]'::jsonb);

-- The family books a consultation and an in-person IEP session, each with one time.
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';
insert into public.dependents (household_id, first_name)
select id, 'Abel' from public.households where primary_owner_id = 'e1000000-0000-4000-8000-000000000001';
insert into ids select 'consult', public.create_service_request('consultation', (select id from public.dependents where first_name = 'Abel'),
  'We would like guidance on bedtime routines.', 'en', gen_random_uuid(), null, 'general_guidance', null, null, null, 'remote');
insert into ids select 'iep', public.create_service_request('iep_language_assistance', (select id from public.dependents where first_name = 'Abel'),
  'Please explain the IEP goals at the school meeting.', 'am', gen_random_uuid(), null, null, null, 'am', array['meeting_language_assistance'],
  'in_person', 'school_meeting', 'Lincoln Elementary, room 12', current_date + 10);
select lives_ok($$select public.set_requested_schedule((select id from ids where name = 'consult'), 'direct', jsonb_build_array(pg_temp.slot(48)))$$,
  'the family picks a time for the consultation');
select lives_ok($$select public.set_requested_schedule((select id from ids where name = 'iep'), 'direct', jsonb_build_array(pg_temp.slot(72)))$$,
  'the family picks a time for the IEP session');
select throws_ok($$select public.confirm_requested_time((select id from ids where name = 'consult'), 0, null, null)$$, '42501', null,
  'the family cannot confirm its own time');

-- An administrator confirms the consultation time once a specialist is assigned.
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000002';
select throws_ok($$select public.confirm_requested_time((select id from ids where name = 'consult'), 0, null, null)$$, '55000', null,
  'a specialist must be assigned first');
select public.admin_assign_service_specialist((select id from ids where name = 'consult'), (select id from ids where name = 'spec'), null);
select public.admin_assign_service_specialist((select id from ids where name = 'iep'), (select id from ids where name = 'spec'), null);
select throws_ok($$select public.confirm_requested_time((select id from ids where name = 'consult'), 1, null, null)$$, '22023', null,
  'only a time the family asked for can be confirmed');
select lives_ok($$select public.confirm_requested_time((select id from ids where name = 'consult'), 0, 'https://meet.example.test/abel', null)$$,
  'the administrator confirms the requested time');
select is((select status from public.service_requests where id = (select id from ids where name = 'consult')), 'awaiting_payment',
  'an unpaid request moves on to payment');
select is((select start_at from public.service_appointments where service_request_id = (select id from ids where name = 'consult') and status = 'confirmed'),
  (select (slots -> 0 ->> 'start_at')::timestamptz from public.service_request_requested_times where service_request_id = (select id from ids where name = 'consult')),
  'the appointment is at the time the family picked');
select is((select meeting_url from public.service_appointments where service_request_id = (select id from ids where name = 'consult') and status = 'confirmed'),
  'https://meet.example.test/abel', 'the optional meeting link is saved');
select throws_ok($$select public.confirm_requested_time((select id from ids where name = 'consult'), 0, null, null)$$, '55000', null,
  'a confirmed time cannot be confirmed twice');

-- Another specialist cannot confirm; the assigned specialist can.
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000004';
select throws_ok($$select public.confirm_requested_time((select id from ids where name = 'iep'), 0, null, null)$$, '42501', null,
  'a specialist who is not assigned cannot confirm');
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000003';
select lives_ok($$select public.confirm_requested_time((select id from ids where name = 'iep'), 0, 'https://ignored.example.test', null)$$,
  'the assigned specialist confirms the IEP time');
select is((select location_type || ' / ' || location_details || ' / ' || coalesce(meeting_url, 'no link') || ' / ' || proposed_by_role
  from public.service_appointments where service_request_id = (select id from ids where name = 'iep') and status = 'confirmed'),
  'school_meeting / Lincoln Elementary, room 12 / no link / specialist',
  'an in-person session uses the location the family asked for');

select * from finish();
rollback;
