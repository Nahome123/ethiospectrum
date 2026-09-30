begin;

select no_plan();

-- Synthetic users only.
--  b1..01 owner (auto-created household)   b1..02 caregiver
--  b1..03 platform administrator           b1..04 specialist Amharic/English
--  b1..05 specialist Spanish only          b1..06 unrelated household owner
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'svc-owner@example.test', 'x', now(), '{}', '{"first_name": "Hana", "last_name": "Bekele", "account_intent": "household_owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'svc-caregiver@example.test', 'x', now(), '{}', '{"first_name": "Dawit"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'svc-admin@example.test', 'x', now(), '{}', '{"first_name": "Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'svc-specialist-am@example.test', 'x', now(), '{}', '{"first_name": "Meron"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'svc-specialist-es@example.test', 'x', now(), '{}', '{"first_name": "Lucia"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'svc-outsider@example.test', 'x', now(), '{}', '{"last_name": "Outside", "account_intent": "household_owner"}', now(), now());

update public.user_roles set role = 'administrator' where user_id = 'b1000000-0000-4000-8000-000000000003';
insert into public.household_members (household_id, user_id, permission, status, joined_at, relationship, caregiver_permissions)
select id, 'b1000000-0000-4000-8000-000000000002', 'member', 'active', now(), 'caregiver', array['submit_requests', 'upload_documents']
from public.households where primary_owner_id = 'b1000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
insert into public.dependents (household_id, first_name, service_needs)
select id, 'Nati', 'Autism support; prefers visual schedules'
from public.households where primary_owner_id = 'b1000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000006';
insert into public.dependents (household_id, first_name)
select id, 'Other child'
from public.households where primary_owner_id = 'b1000000-0000-4000-8000-000000000006';

-- Local time helper: a slot `hours` from the transaction start, in UTC.
create function pg_temp.slot(hours integer, location text default null, details text default null) returns jsonb
language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'local_start', to_char((now() at time zone 'UTC') + make_interval(hours => hours), 'YYYY-MM-DD"T"HH24:MI'),
    'timezone', 'UTC', 'location_type', location, 'location_details', details,
    'meeting_url', case when location is null then 'https://meet.example.test/room' end));
$$;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

-- 1. Catalog and specialist setup by the administrator ---------------------

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select lives_ok($$select public.admin_set_user_role('b1000000-0000-4000-8000-000000000004', 'specialist')$$, 'admin promotes a specialist');
select lives_ok($$select public.admin_set_user_role('b1000000-0000-4000-8000-000000000005', 'specialist')$$, 'admin promotes a second specialist');
select throws_ok($$select public.admin_set_user_role('b1000000-0000-4000-8000-000000000003', 'member')$$, '42501', null, 'admins cannot demote themselves');
insert into ids select 'spec_am', specialist_id from public.admin_list_specialists() where user_id = 'b1000000-0000-4000-8000-000000000004';
insert into ids select 'spec_es', specialist_id from public.admin_list_specialists() where user_id = 'b1000000-0000-4000-8000-000000000005';
select lives_ok($$select public.admin_update_specialist((select id from ids where name = 'spec_am'), 'available', '[{"service_type": "consultation", "language": "en", "delivery_method": "remote"},
    {"service_type": "iep_language_assistance", "language": "am", "delivery_method": "remote"},
    {"service_type": "iep_language_assistance", "language": "am", "delivery_method": "in_person"}]'::jsonb, 'Amharic interpreter')$$, 'admin records specialist capabilities');
select lives_ok($$select public.admin_update_specialist((select id from ids where name = 'spec_es'), 'available', '[{"service_type": "iep_language_assistance", "language": "es", "delivery_method": "remote"}]'::jsonb)$$, 'second specialist capabilities');
select is((select count(*) from public.specialist_capabilities), 4::bigint, 'capabilities are stored');
select throws_ok($$select public.admin_update_specialist((select id from ids where name = 'spec_es'), 'available', '[{"service_type": "iep_language_assistance", "language": "en", "delivery_method": "remote"}]'::jsonb)$$, '23514', null,
  'IEP capabilities must name Amharic or Spanish');
select is((select price_cents from public.services where service_type = 'consultation'), 999, 'consultation is $9.99');
select is((select price_cents from public.services where service_type = 'iep_language_assistance'), 1999, 'IEP language assistance is $19.99');
select is((select duration_minutes from public.services where service_type = 'iep_language_assistance'), 60, 'IEP sessions are 60 minutes');

-- 2. Consultation: request, review, assignment ----------------------------

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
insert into ids select 'dependent', id from public.dependents where first_name = 'Nati';
select throws_ok($$select public.create_service_request('rbt_bootcamp', (select id from ids where name = 'dependent'), 'Need help with routines', 'en', gen_random_uuid(), null, 'general_guidance', null, null, null, 'remote')$$, '22023', null, 'the subscription is not a service request');
insert into ids select 'consult', public.create_service_request('consultation', (select id from ids where name = 'dependent'), 'We need guidance on morning routines at home.', 'en', 'c0000000-0000-4000-8000-000000000001', 'Diagnosed last year.', 'behavioral_educational', 'behavior_support', null, null, 'remote');
select is(public.create_service_request('consultation', (select id from ids where name = 'dependent'), 'We need guidance on morning routines at home.', 'en', 'c0000000-0000-4000-8000-000000000001', 'Diagnosed last year.', 'behavioral_educational', 'behavior_support', null, null, 'remote'), (select id from ids where name = 'consult'),
  'request creation is idempotent');
select is((select status from public.service_requests where id = (select id from ids where name = 'consult')), 'pending_review', 'new requests await review');
select is((select payment_status || '/' || appointment_status from public.service_requests where id = (select id from ids where name = 'consult')),
  'unpaid/none', 'payment and appointment status are tracked separately');
select is((select count(*) from public.service_request_activities where service_request_id = (select id from ids where name = 'consult')), 1::bigint,
  'a consultation session activity is created');
select throws_ok($$select public.create_service_request('consultation', (select id from public.dependents where first_name = 'Other child'), 'Description long enough', 'en', gen_random_uuid(), null, 'general_guidance', null, null, null, 'remote')$$, '22023', null,
  'another household dependent cannot be used');

reset role;
select ok((select count(*) from public.notifications where notification_type = 'admin_new_request') >= 1, 'administrators are notified of new requests');
select ok((select count(*) from public.notifications where notification_type = 'request_received') >= 2, 'owner and caregiver are notified of receipt');

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000004';
select is((select count(*) from public.get_service_request_detail((select id from ids where name = 'consult'))), 0::bigint,
  'an unassigned specialist cannot read the request');
select is((select count(*) from public.service_requests), 0::bigint, 'an unassigned specialist has no table access');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000006';
select is((select count(*) from public.service_requests), 0::bigint, 'another household cannot read the request');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select is((select is_match from public.admin_list_matching_specialists((select id from ids where name = 'consult')) where specialist_id = (select id from ids where name = 'spec_am')),
  true, 'the English consultation specialist matches');
select is((select is_match from public.admin_list_matching_specialists((select id from ids where name = 'consult')) where specialist_id = (select id from ids where name = 'spec_es')),
  false, 'a specialist without the capability does not match');
select throws_ok($$select public.admin_assign_service_specialist((select id from ids where name = 'consult'), (select id from ids where name = 'spec_es'), 1)$$,
  '22023', null, 'assignment requires a matching capability');
select throws_ok($$select public.admin_assign_service_specialist((select id from ids where name = 'consult'), (select id from ids where name = 'spec_am'), 99)$$,
  '40001', null, 'a stale version is rejected');
select lives_ok($$select public.admin_assign_service_specialist((select id from ids where name = 'consult'), (select id from ids where name = 'spec_am'),
  (select version from public.service_requests where id = (select id from ids where name = 'consult')))$$, 'admin assigns the matching specialist');
select is((select status from public.service_requests where id = (select id from ids where name = 'consult')), 'assigned', 'the request is assigned');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000004';
select is((select dependent_service_needs from public.get_service_request_detail((select id from ids where name = 'consult'))),
  'Autism support; prefers visual schedules', 'the assigned specialist sees service-relevant dependent information');
select is((select viewer_role from public.get_service_request_detail((select id from ids where name = 'consult'))), 'specialist', 'viewer role is derived');
select is((select count(*) from public.dependents), 0::bigint, 'the specialist still cannot read the household dependents table');
select throws_ok($$select public.propose_service_appointments((select id from ids where name = 'consult'), 'primary', jsonb_build_array(pg_temp.slot(72)), null)$$,
  '42501', null, 'a specialist proposes only when availability is requested');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select lives_ok($$select public.admin_request_specialist_availability((select id from ids where name = 'consult'), null)$$, 'admin requests specialist availability');
select is((select status from public.service_requests where id = (select id from ids where name = 'consult')), 'awaiting_availability', 'awaiting availability');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000004';
select throws_ok($$select public.propose_service_appointments((select id from ids where name = 'consult'), 'primary', jsonb_build_array(pg_temp.slot(0)), null)$$,
  '22023', null, 'proposals must be in the future');
select throws_ok($$select public.propose_service_appointments((select id from ids where name = 'consult'), 'primary',
  jsonb_build_array(pg_temp.slot(50), pg_temp.slot(51), pg_temp.slot(52), pg_temp.slot(53)), null)$$, '22023', null, 'at most three options');
select is(public.propose_service_appointments((select id from ids where name = 'consult'), 'primary', jsonb_build_array(pg_temp.slot(72), pg_temp.slot(96)), null),
  2, 'the requested specialist proposes two times');
select is((select status || '/' || appointment_status from public.service_requests where id = (select id from ids where name = 'consult')),
  'awaiting_payment/proposed', 'an unpaid request awaits payment after the proposal');
select is((select end_at - start_at from public.service_appointments where service_request_id = (select id from ids where name = 'consult') limit 1),
  interval '60 minutes', 'the appointment duration comes from the service');

-- 3. Payment gating and provider synchronization --------------------------

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select throws_ok($$select public.confirm_service_appointment((select id from public.service_appointments where service_request_id = (select id from ids where name = 'consult') order by start_at limit 1))$$,
  'ES402', null, 'confirmation requires payment first');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000002';
select throws_ok($$select * from public.prepare_service_payment((select id from ids where name = 'consult'), null, false)$$, '42501', null,
  'a caregiver without payment permission cannot pay');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
insert into ids select 'payment1', payment_id from public.prepare_service_payment((select id from ids where name = 'consult'), null, false);
select is((select subtotal_cents from public.service_payments where id = (select id from ids where name = 'payment1')), 999, 'the payment amount is derived server-side');
select is((select payment_status from public.service_requests where id = (select id from ids where name = 'consult')), 'pending', 'payment is pending');
select throws_ok($$select public.sync_service_payment((select id from ids where name = 'payment1'), 'cs_test_one', 'paid', now(), null, 999, 0)$$,
  '42501', null, 'browsers cannot synchronize payments');

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok($$select public.attach_service_payment_session((select id from ids where name = 'payment1'), 'cs_test_one')$$, 'the checkout session is attached');
select is(public.sync_service_payment((select id from ids where name = 'payment1'), 'cs_test_one', 'paid', now(), 'pi_test_one', 999, 0), true,
  'provider-confirmed payment is recorded');
select is(public.sync_service_payment((select id from ids where name = 'payment1'), 'cs_test_one', 'paid', now(), 'pi_test_one', 999, 0), false,
  'duplicate provider events are idempotent');
select is(public.sync_service_payment((select id from ids where name = 'payment1'), 'cs_test_one', 'failed', now(), 'pi_test_one', null, null, 'card_declined'), false,
  'a settled payment never regresses');
reset role;
select is((select status || '/' || payment_status from public.service_requests where id = (select id from ids where name = 'consult')),
  'appointment_proposed/paid', 'paid requests move to the proposal step');
select ok((select count(*) from public.notifications where notification_type = 'payment_confirmed') >= 1, 'payment confirmation is notified');

-- 4. Confirmation and the timing-based reschedule policy ------------------

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select lives_ok($$select public.confirm_service_appointment((select id from public.service_appointments where service_request_id = (select id from ids where name = 'consult') order by start_at limit 1))$$,
  'the household owner confirms the 72-hour option');
select is((select status from public.service_requests where id = (select id from ids where name = 'consult')), 'appointment_confirmed', 'appointment confirmed');
select is((select string_agg(status, ',' order by start_at) from public.service_appointments where service_request_id = (select id from ids where name = 'consult')),
  'confirmed,declined', 'the other option is declined');
select is((select meeting_url from public.list_service_request_appointments((select id from ids where name = 'consult')) where status = 'confirmed'),
  'https://meet.example.test/room', 'the meeting link is released once confirmed');
select lives_ok($$select public.request_service_reschedule((select id from ids where name = 'consult'), 'Family conflict')$$, 'rescheduling more than 48 hours ahead is allowed');
select is((select late_reschedule_used from public.service_requests where id = (select id from ids where name = 'consult')), false, 'an early reschedule does not use the late allowance');
select is((select status from public.service_requests where id = (select id from ids where name = 'consult')), 'reschedule_requested', 'reschedule requested');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select is(public.propose_service_appointments((select id from ids where name = 'consult'), 'primary', jsonb_build_array(pg_temp.slot(30)), null), 1, 'admin proposes a new time');
select is((select status from public.service_requests where id = (select id from ids where name = 'consult')), 'appointment_proposed', 'already-paid proposals skip payment');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select lives_ok($$select public.confirm_service_appointment((select id from public.service_appointments where service_request_id = (select id from ids where name = 'consult') and status = 'proposed'))$$,
  'the owner confirms the 30-hour option');
select lives_ok($$select public.request_service_reschedule((select id from ids where name = 'consult'), null)$$, 'one reschedule within 48 hours is allowed');
select is((select late_reschedule_used::text || '/' || refund_cap_percent from public.service_requests where id = (select id from ids where name = 'consult')),
  'true/50', 'the late reschedule is recorded and caps the refund');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select is(public.propose_service_appointments((select id from ids where name = 'consult'), 'primary', jsonb_build_array(pg_temp.slot(100)), null), 1, 'admin proposes again');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select lives_ok($$select public.confirm_service_appointment((select id from public.service_appointments where service_request_id = (select id from ids where name = 'consult') and status = 'proposed'))$$,
  'the owner confirms the new time');

-- 5. Cancellation refund: the prior late reschedule caps it at 50% --------

select is((select refund_percent from public.cancel_service_request((select id from ids where name = 'consult'), 'Plans changed')), 50,
  'cancellation after a late reschedule is capped at 50%');
select is((select status from public.service_requests where id = (select id from ids where name = 'consult')), 'cancelled', 'the request is cancelled');
select is((select eligible_amount_cents from public.service_refunds where service_request_id = (select id from ids where name = 'consult')), 499,
  'the refund request holds the policy amount');
select throws_ok($$select * from public.cancel_service_request((select id from ids where name = 'consult'), null)$$, '55000', null, 'cancelled requests cannot be cancelled again');

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select throws_ok($$select * from public.begin_service_refund((select id from public.service_refunds limit 1), 'b1000000-0000-4000-8000-000000000001', 499)$$,
  '42501', null, 'only an administrator can process refunds');
select throws_ok($$select * from public.begin_service_refund((select id from public.service_refunds limit 1), 'b1000000-0000-4000-8000-000000000003', 999)$$,
  '22023', null, 'refunds cannot exceed the policy amount');
select is((select provider_transaction_id from public.begin_service_refund((select id from public.service_refunds limit 1), 'b1000000-0000-4000-8000-000000000003', 499)),
  'pi_test_one', 'the refund targets the provider transaction');
select lives_ok($$select public.complete_service_refund((select id from public.service_refunds limit 1), 'succeeded', 're_test_one')$$, 'the refund completes');
reset role;
select is((select status || '/' || refunded_amount_cents from public.service_payments where id = (select id from ids where name = 'payment1')),
  'partially_refunded/499', 'the payment is partially refunded');
select is((select payment_status from public.service_requests where id = (select id from ids where name = 'consult')), 'partially_refunded', 'request payment status follows');
select is((select original_amount_cents || '/' || refund_amount_cents || '/' || provider_refund_id || '/' || (processed_by is not null)::text || '/' || (processed_at is not null)::text
  from public.service_refunds limit 1), '999/499/re_test_one/true/true', 'the refund record contains every required field');

-- 6. IEP Language Assistance: caregiver request, direct scheduling, delivery ---

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000002';
select throws_ok($$select public.create_service_request('iep_language_assistance', (select id from ids where name = 'dependent'), 'Please explain the IEP goals.', 'am', gen_random_uuid(), null, null, null, 'am', array['iep_explanation'], 'in_person')$$, '23514', null, 'in-person IEP requests require a location type');
insert into ids select 'iep', public.create_service_request('iep_language_assistance', (select id from ids where name = 'dependent'), 'Please explain the IEP goals and join the annual meeting.', 'am', gen_random_uuid(), 'Annual review.', null, null, 'am', array['written_translation', 'iep_explanation', 'meeting_language_assistance'], 'in_person', 'school_meeting', 'Lincoln Elementary, room 12', current_date + 10);
select is((select count(*) from public.service_request_activities where service_request_id = (select id from ids where name = 'iep')), 3::bigint,
  'each IEP service, including written translation, is tracked as an activity');
select is((select iep_services from public.service_requests where id = (select id from ids where name = 'iep')),
  array['iep_explanation', 'meeting_language_assistance', 'written_translation']::text[], 'IEP services are normalized');
select lives_ok($$insert into public.documents (household_id, dependent_id, service_request_id, title, original_filename, mime_type, file_size, storage_path)
  values ((select household_id from public.service_requests where id = (select id from ids where name = 'iep')), (select id from ids where name = 'dependent'),
    (select id from ids where name = 'iep'), 'Current IEP', 'current-iep.pdf', 'application/pdf', 2048, 'pending')$$,
  'the caregiver uploads an IEP document linked to the request');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select throws_ok($$select public.admin_assign_service_specialist((select id from ids where name = 'iep'), (select id from ids where name = 'spec_es'), null)$$,
  '22023', null, 'a Spanish specialist cannot take an Amharic IEP request');
select lives_ok($$select public.admin_assign_service_specialist((select id from ids where name = 'iep'), (select id from ids where name = 'spec_am'), null)$$,
  'language-matched assignment');
select throws_ok($$select public.admin_schedule_service_appointment((select id from ids where name = 'iep'), 'primary', pg_temp.slot(120, 'school_meeting'), null)$$,
  '22023', null, 'school meetings require location details');
select lives_ok($$select public.admin_schedule_service_appointment((select id from ids where name = 'iep'), 'primary',
  pg_temp.slot(120, 'school_meeting', 'Lincoln Elementary, check in at the main office'), null)$$, 'admin schedules directly');
select is((select status || '/' || appointment_status from public.service_requests where id = (select id from ids where name = 'iep')),
  'awaiting_payment/confirmed', 'a directly scheduled unpaid appointment still requires payment');
select is((select scheduled_directly::text || '/' || customer_confirmed::text || '/' || location_type from public.service_appointments
  where service_request_id = (select id from ids where name = 'iep')), 'true/false/school_meeting', 'direct scheduling is recorded');
select throws_ok($$select public.admin_schedule_service_appointment((select id from ids where name = 'iep'), 'primary', pg_temp.slot(121, 'school_meeting', 'x'), null)$$,
  '55000', null, 'a second confirmed primary appointment is rejected');

-- Specialist conflict: the same specialist cannot hold overlapping confirmed appointments.
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
insert into ids select 'conflict', public.create_service_request('iep_language_assistance', (select id from ids where name = 'dependent'), 'Remote explanation of an IEP draft.', 'am', gen_random_uuid(), null, null, null, 'am', array['iep_explanation'], 'remote');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select lives_ok($$select public.admin_assign_service_specialist((select id from ids where name = 'conflict'), (select id from ids where name = 'spec_am'), null)$$, 'assign second request');
select throws_ok($$select public.admin_schedule_service_appointment((select id from ids where name = 'conflict'), 'primary', pg_temp.slot(120), null)$$,
  'ES409', null, 'overlapping confirmed appointments are rejected');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000004';
select is((select count(*) from public.list_service_request_documents((select id from ids where name = 'iep'))), 0::bigint, 'pending uploads are not listed');
-- One synthetic Storage metadata row stands in for the uploaded object.
reset role;
insert into storage.objects (bucket_id, name, metadata)
select storage_bucket, storage_path, jsonb_build_object('size', 2048, 'mimetype', 'application/pdf')
from public.documents where service_request_id = (select id from ids where name = 'iep');
set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000002';
select lives_ok($$update public.documents set upload_status = 'uploaded' where service_request_id = (select id from ids where name = 'iep')$$,
  'the caregiver completes the upload');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000004';
select is((select count(*) from storage.objects), 1::bigint, 'the assigned specialist can read the private object');
select is((select count(*) from public.documents where service_request_id = (select id from ids where name = 'iep')), 1::bigint,
  'the assigned specialist can read documents for the assigned request');
select is((select count(*) from public.documents where service_request_id is null), 0::bigint, 'the specialist cannot read unrelated household documents');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000005';
select is((select count(*) from public.documents), 0::bigint, 'another specialist cannot read the documents');

-- Payment, then delivery.
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
insert into ids select 'payment2', payment_id from public.prepare_service_payment((select id from ids where name = 'iep'), null, false);
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok($$select public.attach_service_payment_session((select id from ids where name = 'payment2'), 'cs_test_two')$$, 'attach second session');
select is(public.sync_service_payment((select id from ids where name = 'payment2'), 'cs_test_two', 'paid', now(), 'pi_test_two', 2138, 139), true, 'IEP payment recorded with tax');
reset role;
select is((select status from public.service_requests where id = (select id from ids where name = 'iep')), 'appointment_confirmed', 'payment completes the direct schedule');
select is((select tax_amount_cents || '/' || amount_total_cents from public.service_payments where id = (select id from ids where name = 'payment2')), '139/2138',
  'provider-calculated tax is recorded separately');

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000004';
select throws_ok($$select public.record_service_appointment_outcome((select id from public.service_appointments where service_request_id = (select id from ids where name = 'iep') and status = 'confirmed'), 'completed', null)$$,
  '55000', null, 'a session cannot be recorded before it starts');
reset role;
update public.service_appointments set start_at = now() - interval '2 hours', end_at = now() - interval '1 hour'
where service_request_id = (select id from ids where name = 'iep') and status = 'confirmed';
set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000004';
select lives_ok($$select public.record_service_appointment_outcome((select id from public.service_appointments where service_request_id = (select id from ids where name = 'iep') and status = 'confirmed'), 'completed', 'Explained goals')$$,
  'the specialist records the session');
select is((select status || '/' || follow_up_status || '/' || appointment_status from public.service_requests where id = (select id from ids where name = 'iep')),
  'in_progress/available/completed', 'the included follow-up becomes available');
select throws_ok($$select public.complete_service_request((select id from ids where name = 'iep'), 'Done', false, null)$$, '55000', null,
  'completion requires the follow-up to be used or waived');
select lives_ok($$select public.update_service_activity((select id from public.service_request_activities where service_request_id = (select id from ids where name = 'iep') and activity_type = 'written_translation'), 'completed', 'Translated IEP delivered')$$,
  'the written translation is tracked separately');
select lives_ok($$insert into public.documents (household_id, dependent_id, service_request_id, title, original_filename, mime_type, file_size, storage_path)
  values ((select household_id from public.service_requests where id = (select id from ids where name = 'iep')), (select id from ids where name = 'dependent'),
    (select id from ids where name = 'iep'), 'Amharic translation', 'translation.pdf', 'application/pdf', 4096, 'pending')$$,
  'the specialist can prepare a translated deliverable');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select lives_ok($$select public.request_service_follow_up((select id from ids where name = 'iep'), 'Questions after the meeting')$$, 'the household requests the follow-up');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000004';
select is(public.propose_service_appointments((select id from ids where name = 'iep'), 'follow_up', jsonb_build_array(pg_temp.slot(200, 'ethiospectrum_location')), null), 1,
  'the specialist proposes the follow-up');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select lives_ok($$select public.confirm_service_appointment((select id from public.service_appointments where service_request_id = (select id from ids where name = 'iep') and status = 'proposed'))$$,
  'the follow-up is confirmed without another payment');
select is((select follow_up_status from public.service_requests where id = (select id from ids where name = 'iep')), 'scheduled', 'the follow-up is scheduled');
reset role;
update public.service_appointments set start_at = now() - interval '2 hours', end_at = now() - interval '1 hour'
where service_request_id = (select id from ids where name = 'iep') and status = 'confirmed' and kind = 'follow_up';
set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000004';
select lives_ok($$select public.record_service_appointment_outcome((select id from public.service_appointments where service_request_id = (select id from ids where name = 'iep') and kind = 'follow_up' and status = 'confirmed'), 'completed', null)$$,
  'the follow-up is recorded');
select lives_ok($$select public.add_service_request_message((select id from ids where name = 'iep'), 'The translation is attached.')$$, 'the specialist messages the household');
select lives_ok($$select public.complete_service_request((select id from ids where name = 'iep'), 'All IEP services delivered.', false, null)$$, 'the specialist completes the service');
select is((select status || '/' || follow_up_status from public.service_requests where id = (select id from ids where name = 'iep')), 'completed/completed', 'completed');
select is((select count(*) from public.service_request_events where service_request_id = (select id from ids where name = 'iep') and action = 'service_completed' and actor_kind = 'specialist'),
  1::bigint, 'the completion records who completed it');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select ok((select count(*) from public.list_service_request_timeline((select id from ids where name = 'iep')) where item_type = 'message') = 1, 'the household sees the message');
select is((select completion_notes from public.list_service_request_appointments((select id from ids where name = 'iep')) limit 1), null,
  'internal session notes are not shown to the household');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000006';
select throws_ok($$select public.add_service_request_message((select id from ids where name = 'iep'), 'Hello')$$, '42501', null, 'outsiders cannot message');
select is((select count(*) from public.list_service_request_timeline((select id from ids where name = 'iep'))), 0::bigint, 'outsiders cannot read the timeline');

-- 7. Payment failure, retry, administrative cancellation ------------------

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
insert into ids select 'retry', public.create_service_request('consultation', (select id from ids where name = 'dependent'), 'General questions about services.', 'en', gen_random_uuid(), null, 'general_guidance', null, null, null, 'remote');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select lives_ok($$select public.admin_assign_service_specialist((select id from ids where name = 'retry'), (select id from ids where name = 'spec_am'), null)$$, 'assign');
select is(public.propose_service_appointments((select id from ids where name = 'retry'), 'primary', jsonb_build_array(pg_temp.slot(150)), null), 1, 'admin proposes');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
insert into ids select 'payment3', payment_id from public.prepare_service_payment((select id from ids where name = 'retry'), null, false);
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok($$select public.attach_service_payment_session((select id from ids where name = 'payment3'), 'cs_test_three')$$, 'attach');
select is(public.sync_service_payment((select id from ids where name = 'payment3'), 'cs_test_three', 'failed', now(), 'pi_test_three', null, null, 'card_declined'), true, 'failure recorded');
reset role;
select is((select status || '/' || payment_status from public.service_requests where id = (select id from ids where name = 'retry')),
  'payment_failed/failed', 'the request stays pending with a failed payment');
select ok((select count(*) from public.notifications where notification_type = 'payment_failed' and service_request_id = (select id from ids where name = 'retry')) >= 1,
  'the customer is notified of the failure');
select ok((select count(*) from public.notifications where notification_type = 'admin_payment_failed') >= 1, 'administrators are notified of the failure');

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select is((select can_pay from public.get_service_request_detail((select id from ids where name = 'retry'))), true, 'retry is offered');
insert into ids select 'payment4', payment_id from public.prepare_service_payment((select id from ids where name = 'retry'), null, false);
select is((select count(*) from public.service_requests where household_id = (select household_id from public.service_requests where id = (select id from ids where name = 'retry'))), 4::bigint,
  'retrying payment does not duplicate the request');

-- Additional fees must be disclosed and accepted.
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select lives_ok($$select public.admin_save_service_fee('consultation', 'Printed materials', 'Printed copies of session materials', 250, true)$$, 'admin configures a fee');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.prepare_service_payment((select id from ids where name = 'retry'), null, false)$$, 'ES422', null, 'unaccepted fees block payment');
select is((select subtotal_cents from public.prepare_service_payment((select id from ids where name = 'retry'),
  (select array_agg(id) from public.service_fees where active), true)), 1249, 'accepted fees are included in the total');

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok($$select public.attach_service_payment_session((select id from public.service_payments where service_request_id = (select id from ids where name = 'retry') and status = 'pending'), 'cs_test_four')$$, 'attach');
select is(public.sync_service_payment((select id from public.service_payments where provider_checkout_session_id = 'cs_test_four'), 'cs_test_four', 'paid', now(), 'pi_test_four', 1249, 0), true, 'retry succeeds');
reset role;
select is((select status from public.service_requests where id = (select id from ids where name = 'retry')), 'appointment_proposed', 'a successful retry resumes the workflow');

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select lives_ok($$select public.confirm_service_appointment((select id from public.service_appointments where service_request_id = (select id from ids where name = 'retry') and status = 'proposed'))$$, 'confirm');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select lives_ok($$select public.admin_cancel_service_appointment((select id from public.service_appointments where service_request_id = (select id from ids where name = 'retry') and status = 'confirmed'), 'Specialist illness')$$,
  'Ethiospectrum cancels the appointment');
select is((select status || '/' || full_refund_eligible::text from public.service_requests where id = (select id from ids where name = 'retry')),
  'reschedule_requested/true', 'the customer may reschedule or take a full refund');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select is((select refund_percent from public.cancel_service_request((select id from ids where name = 'retry'), null)), 100, 'administrative cancellation refunds 100%');

-- 8. Administrator work queue and role isolation ---------------------------

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select is((select count(*) from public.admin_service_queue_counts()), 14::bigint, 'the admin work queue exposes every bucket');
select ok((select item_count from public.admin_service_queue_counts() where queue = 'refunds') >= 1, 'open refund requests are queued');
select ok((select count(*) from public.admin_list_service_requests('cancelled', null, 1)) >= 2, 'cancelled requests are listed');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.admin_service_queue_counts()$$, '42501', null, 'households cannot read the admin queue');
select throws_ok($$select public.admin_assign_service_specialist((select id from ids where name = 'conflict'), (select id from ids where name = 'spec_am'), null)$$,
  '42501', null, 'households cannot assign specialists');
select is((select count(*) from public.list_household_service_requests(null, 1)), 4::bigint, 'the household lists its requests');
select is((select count(*) from public.list_household_payment_history()), 5::bigint, 'the household sees its payment history');

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000004';
select is((select count(*) from public.list_specialist_service_requests('all', 1)), 4::bigint, 'the specialist lists only assigned requests');
select throws_ok($$select * from public.admin_list_service_payments(null, 1)$$, '42501', null, 'specialists cannot read payments');
select is((select count(*) from public.list_service_request_payments((select id from ids where name = 'iep'))), 0::bigint, 'specialists do not see payment rows');

select is((select refund_percent from public.service_refund_policy(72)), 100, 'more than 48 hours: 100%');
select is((select refund_percent from public.service_refund_policy(30)), 50, '24 to 48 hours: 50%');
select is((select refund_percent from public.service_refund_policy(10)), 0, 'under 24 hours: no cash refund');

-- 9. No-show: no automatic refund; the administrator may approve a reschedule ---

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
insert into ids select 'noshow', public.create_service_request('consultation', (select id from ids where name = 'dependent'), 'Questions about school services.', 'en', gen_random_uuid(), null, 'general_guidance', 'getting_started', null, null, 'remote');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000003';
select lives_ok($$select public.admin_assign_service_specialist((select id from ids where name = 'noshow'), (select id from ids where name = 'spec_am'), null)$$, 'assign');
select lives_ok($$select public.admin_schedule_service_appointment((select id from ids where name = 'noshow'), 'primary', pg_temp.slot(300), null)$$, 'schedule');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
insert into ids select 'payment5', payment_id from public.prepare_service_payment((select id from ids where name = 'noshow'),
  (select array_agg(id) from public.service_fees where active), true);
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok($$select public.attach_service_payment_session((select id from ids where name = 'payment5'), 'cs_test_five')$$, 'attach');
select is(public.sync_service_payment((select id from ids where name = 'payment5'), 'cs_test_five', 'paid', now(), 'pi_test_five', 1249, 0), true, 'paid');
reset role;
update public.service_appointments set start_at = now() - interval '2 hours', end_at = now() - interval '1 hour'
where service_request_id = (select id from ids where name = 'noshow') and status = 'confirmed';
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000004';
select lives_ok($$select public.record_service_appointment_outcome((select id from public.service_appointments where service_request_id = (select id from ids where name = 'noshow') and status = 'confirmed'), 'no_show', null)$$,
  'the specialist records a no-show');
select is((select status || '/' || appointment_status from public.service_requests where id = (select id from ids where name = 'noshow')), 'no_show/no_show', 'no-show recorded');
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select is((select refund_tier || '/' || refund_percent from public.cancel_service_request((select id from ids where name = 'noshow'), null)), 'no_show/0',
  'a no-show receives no automatic refund');
select is((select count(*) from public.service_refunds where service_request_id = (select id from ids where name = 'noshow')), 0::bigint, 'no refund request is created');

select * from finish();
rollback;
