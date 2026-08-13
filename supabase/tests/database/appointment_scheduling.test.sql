begin;

select plan(116);

-- Synthetic fixtures only. Household A: owner, member, viewer. Household B: an
-- unrelated owner. Global roles: platform administrator, two specialists, and a
-- content editor. Household A also carries an ACTIVE dormant
-- household_specialists row, which must never grant appointment access.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'appt-owner@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'appt-member@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'appt-viewer@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'appt-outsider@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'appt-admin@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'appt-specialist@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'appt-specialist-two@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'appt-editor@example.test', 'x', now(), '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('d2000000-0000-4000-8000-000000000001', 'Appointment household', 'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000002', 'Other appointment household', 'd1000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000004');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'member', 'active', now()),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'viewer', 'active', now()),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000004', 'owner', 'active', now());

update public.user_roles set role = 'administrator' where user_id = 'd1000000-0000-4000-8000-000000000005';
update public.user_roles set role = 'specialist' where user_id = 'd1000000-0000-4000-8000-000000000006';
update public.user_roles set role = 'specialist' where user_id = 'd1000000-0000-4000-8000-000000000007';
update public.user_roles set role = 'content_editor' where user_id = 'd1000000-0000-4000-8000-000000000008';

insert into public.specialists (id, user_id, availability_status)
values
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000006', 'available'),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000007', 'available');

insert into public.household_specialists (household_id, specialist_id, status)
values ('d2000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', 'active');

-- Structure and the replaced policy.
select has_table('public', 'appointments', 'existing appointments table is reused');
select has_table('public', 'appointment_events', 'appointment audit table exists');
select has_column('public', 'appointments', 'support_thread_id', 'appointments link to a support request');
select has_column('public', 'appointments', 'timezone', 'appointment timezone column exists');
select has_column('public', 'appointments', 'duration_minutes', 'appointment duration column exists');
select has_column('public', 'appointments', 'modality', 'appointment modality column exists');
select has_column('public', 'appointments', 'consented_by', 'appointment consent actor column exists');
select has_column('public', 'appointments', 'consent_copy_version', 'appointment consent version column exists');
select has_column('public', 'appointments', 'supersedes_appointment_id', 'appointment supersede link exists');
select has_column('public', 'appointments', 'version', 'appointment version column exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.appointments'::regclass), 'appointment RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.appointment_events'::regclass), 'appointment audit RLS is enabled and forced');
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'appointments' and policyname = 'appointments_access'),
  'the unsafe can_access_household appointments policy is removed');
select ok((select count(*) from pg_policies where schemaname = 'public'
    and tablename in ('appointments', 'appointment_events')
    and (qual like '%can_access_household%' or qual like '%household_specialists%')) = 0,
  'no appointment policy uses can_access_household or household_specialists');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'appointments_one_active_per_request_idx'),
  'one active appointment per request index exists');

-- Fixtures: two open requests in household A, one in household B.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select lives_ok($$select * from public.create_support_request('Appointment request one', 'general', 'en', 'A synthetic request used to exercise appointment scheduling.', true, 'd4000000-0000-4000-8000-000000000001')$$, 'owner creates the first request');
select lives_ok($$select * from public.create_support_request('Appointment request two', 'general', 'en', 'A second synthetic request used for conflict checks.', true, 'd4000000-0000-4000-8000-000000000002')$$, 'owner creates a second request');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000004';
select lives_ok($$select * from public.create_support_request('Other household request', 'general', 'en', 'An unrelated household request for isolation checks.', true, 'd4000000-0000-4000-8000-000000000003')$$, 'outsider creates a request');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000005';
select lives_ok($$select * from public.assign_specialist_to_support_request((select id from public.support_threads where subject = 'Appointment request one'), 'd3000000-0000-4000-8000-000000000001', 0)$$, 'administrator assigns the specialist to request one');
select lives_ok($$select * from public.assign_specialist_to_support_request((select id from public.support_threads where subject = 'Appointment request two'), 'd3000000-0000-4000-8000-000000000001', 0)$$, 'the same specialist is assigned to request two');
reset role;

-- Anonymous denial.
set local role anon;
select throws_ok($$select * from public.appointments$$, '42501', null, 'anonymous users cannot read appointments');
select throws_ok($$select * from public.appointment_events$$, '42501', null, 'anonymous users cannot read appointment events');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads limit 1), (now() + interval '3 days')::timestamp, 'UTC', 30, 'phone', null, 'd5000000-0000-4000-8000-0000000000ff')$$, '42501', null, 'anonymous users cannot propose');
reset role;

-- Only the assigned specialist proposes.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'UTC', 30, 'phone', null, 'd5000000-0000-4000-8000-000000000010')$$, '42501', null, 'a household owner cannot propose an appointment');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000008';
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'UTC', 30, 'phone', null, 'd5000000-0000-4000-8000-000000000011')$$, '42501', null, 'the content editor cannot propose an appointment');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000007';
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'UTC', 30, 'phone', null, 'd5000000-0000-4000-8000-000000000012')$$, '42501', null, 'an unassigned specialist cannot propose');
select is((select count(*) from public.appointments), 0::bigint, 'an active household_specialists row grants no appointment access');
reset role;

-- Validation bounds.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000006';
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'Not/AZone', 30, 'phone', null, 'd5000000-0000-4000-8000-000000000013')$$, '22023', null, 'an invalid timezone is rejected');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), '2027-03-14 02:30'::timestamp, 'America/New_York', 30, 'phone', null, 'd5000000-0000-4000-8000-000000000014')$$, '22007', null, 'a nonexistent spring-forward local time is rejected');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), '2026-11-01 01:30'::timestamp, 'America/New_York', 30, 'phone', null, 'd5000000-0000-4000-8000-000000000015')$$, '22008', null, 'an ambiguous fall-back local time is rejected');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'UTC', 25, 'phone', null, 'd5000000-0000-4000-8000-000000000016')$$, '22023', null, 'an unsupported duration is rejected');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'UTC', 30, 'in_person', null, 'd5000000-0000-4000-8000-000000000017')$$, '22023', null, 'an unsupported modality is rejected');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '2 hours')::timestamp, 'UTC', 30, 'phone', null, 'd5000000-0000-4000-8000-000000000018')$$, '22023', null, 'an appointment inside the 24-hour lead time is rejected');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '120 days')::timestamp, 'UTC', 30, 'phone', null, 'd5000000-0000-4000-8000-000000000019')$$, '22023', null, 'an appointment beyond the 90-day horizon is rejected');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'UTC', 30, 'video', null, 'd5000000-0000-4000-8000-00000000001a')$$, '22023', null, 'a video appointment without a link is rejected');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'UTC', 30, 'video', 'http://insecure.example.test/x', 'd5000000-0000-4000-8000-00000000001b')$$, '22023', null, 'a non-HTTPS meeting link is rejected');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'UTC', 30, 'video', 'javascript:alert(1)', 'd5000000-0000-4000-8000-00000000001c')$$, '22023', null, 'a javascript meeting link is rejected');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'UTC', 30, 'phone', 'https://meet.example.test/x', 'd5000000-0000-4000-8000-00000000001d')$$, '22023', null, 'a phone appointment cannot carry a meeting link');

-- Valid proposal.
select lives_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'America/New_York', 45, 'video', 'https://meet.example.test/synthetic', 'd5000000-0000-4000-8000-000000000020')$$, 'the assigned specialist proposes an appointment');
select is((select status from public.appointments), 'proposed', 'the appointment starts as proposed');
select is((select version from public.appointments), 1, 'the appointment starts at version one');
select is((select household_id from public.appointments), 'd2000000-0000-4000-8000-000000000001'::uuid, 'the household is derived from the request');
select is((select specialist_id from public.appointments), 'd3000000-0000-4000-8000-000000000001'::uuid, 'the specialist is derived from the assignment');
select ok((select end_time = start_time + interval '45 minutes' from public.appointments), 'the end time follows the chosen duration');
select ok((select consented_at is null from public.appointments), 'a proposal carries no consent yet');
select ok(exists (select 1 from public.appointment_events where action = 'proposed'), 'proposing writes an audit event');
select lives_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '3 days')::timestamp, 'America/New_York', 45, 'video', 'https://meet.example.test/synthetic', 'd5000000-0000-4000-8000-000000000020')$$, 'duplicate proposal key is safely idempotent');
select is((select count(*) from public.appointments), 1::bigint, 'duplicate proposal key creates one appointment');
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '5 days')::timestamp, 'UTC', 30, 'phone', null, 'd5000000-0000-4000-8000-000000000021')$$, '23505', null, 'only one active appointment per request is allowed');

-- Conflict detection across requests for the same specialist.
select throws_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request two'), (select (start_time at time zone 'UTC') + interval '10 minutes' from public.appointments), 'UTC', 30, 'phone', null, 'd5000000-0000-4000-8000-000000000022')$$, '23P01', null, 'an overlapping appointment for the same specialist is rejected');
select lives_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request two'), (select (end_time at time zone 'UTC') from public.appointments where support_thread_id = (select id from public.support_threads where subject = 'Appointment request one')), 'UTC', 30, 'phone', null, 'd5000000-0000-4000-8000-000000000023')$$, 'a back-to-back appointment is allowed with half-open intervals');
select is((select count(*) from public.appointments), 2::bigint, 'the back-to-back appointment is stored');
reset role;

-- Read matrix.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select is((select count(*) from public.appointments), 2::bigint, 'the household owner reads household appointments');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000003';
select is((select count(*) from public.appointments), 2::bigint, 'the household viewer reads household appointments');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000004';
select is((select count(*) from public.appointments), 0::bigint, 'an unrelated household reads no appointments');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000005';
select is((select count(*) from public.appointments), 2::bigint, 'the platform administrator reads appointments');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000007';
select is((select count(*) from public.appointments), 0::bigint, 'an unassigned specialist reads no appointments');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000006';
select is((select count(*) from public.appointments), 2::bigint, 'the assigned specialist reads only assigned appointments');
reset role;

-- Consent.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000003';
select throws_ok($$select * from public.accept_support_appointment((select id from public.appointments where duration_minutes = 45), 1, 'eth-027.v1', true)$$, '42501', null, 'a household viewer cannot consent');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000006';
select throws_ok($$select * from public.accept_support_appointment((select id from public.appointments where duration_minutes = 45), 1, 'eth-027.v1', true)$$, '42501', null, 'the specialist cannot accept their own proposal');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000004';
select throws_ok($$select * from public.accept_support_appointment((select id from public.appointments where duration_minutes = 45), 1, 'eth-027.v1', true)$$, '42501', null, 'an unrelated household cannot consent');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000002';
select throws_ok($$select * from public.accept_support_appointment((select id from public.appointments where duration_minutes = 45), 1, 'eth-027.v1', false)$$, '22023', null, 'consent must be acknowledged');
select throws_ok($$select * from public.accept_support_appointment((select id from public.appointments where duration_minutes = 45), 9, 'eth-027.v1', true)$$, '40001', null, 'a stale appointment version is rejected');
select lives_ok($$select * from public.accept_support_appointment((select id from public.appointments where duration_minutes = 45), 1, 'eth-027.v1', true)$$, 'a household member consents to the appointment');
select is((select status from public.appointments where duration_minutes = 45), 'scheduled', 'consent schedules the appointment');
select is((select consented_by from public.appointments where duration_minutes = 45), 'd1000000-0000-4000-8000-000000000002'::uuid, 'the consent actor is derived server-side');
select ok((select consented_at is not null from public.appointments where duration_minutes = 45), 'the consent timestamp is server-generated');
select is((select consent_copy_version from public.appointments where duration_minutes = 45), 'eth-027.v1', 'the consent copy version is recorded');
select is((select version from public.appointments where duration_minutes = 45), 2, 'consent increments the appointment version');
select ok(exists (select 1 from public.appointment_events where action = 'accepted'), 'consent writes an audit event');
select throws_ok($$select * from public.accept_support_appointment((select id from public.appointments where duration_minutes = 45), 2, 'eth-027.v1', true)$$, '55000', null, 'an accepted appointment cannot be accepted again');
reset role;

-- No in-place modification of agreed terms, and no browser writes at all.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select throws_ok($$update public.appointments set start_time = now() + interval '9 days' where duration_minutes = 45$$, '42501', null, 'browser clients cannot modify an appointment');
select throws_ok($$insert into public.appointment_events (appointment_id, support_thread_id, household_id, actor_user_id, action, appointment_version) values ((select id from public.appointments where duration_minutes = 45), (select id from public.support_threads where subject = 'Appointment request one'), 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'accepted', 1)$$, '42501', null, 'browser clients cannot forge appointment events');
select throws_ok($$update public.appointment_events set action = 'completed'$$, '42501', null, 'appointment event updates are denied');
select throws_ok($$delete from public.appointment_events$$, '42501', null, 'appointment event deletes are denied');
reset role;
select throws_ok($$update public.appointments set start_time = now() + interval '9 days' where duration_minutes = 45$$, '42501', null, 'even elevated writes cannot bypass the appointment marker');
select throws_ok($$update public.appointment_events set reason = 'request_closed'$$, '42501', null, 'even elevated writes cannot alter appointment events');
select ok(not exists (select 1 from public.appointment_events where safe_metadata::text like '%http%'), 'no meeting URL appears in appointment audit metadata');

-- Completion is specialist-only and time-bounded.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.complete_support_appointment((select id from public.appointments where duration_minutes = 45), 2)$$, '42501', null, 'the household cannot complete an appointment');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000005';
select throws_ok($$select * from public.complete_support_appointment((select id from public.appointments where duration_minutes = 45), 2)$$, '42501', null, 'the platform administrator cannot complete an appointment');
select throws_ok($$select * from public.cancel_support_appointment((select id from public.appointments where duration_minutes = 45), 2, false)$$, '42501', null, 'the platform administrator cannot cancel an appointment');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000006';
select throws_ok($$select * from public.complete_support_appointment((select id from public.appointments where duration_minutes = 45), 2)$$, '22023', null, 'a future appointment cannot be completed yet');
reset role;

-- Decline and reschedule.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select lives_ok($$select * from public.decline_support_appointment((select id from public.appointments where duration_minutes = 30), 1)$$, 'a household owner declines a proposal');
select is((select status from public.appointments where duration_minutes = 30), 'declined', 'declining records the declined status');
select ok(exists (select 1 from public.appointment_events where action = 'declined'), 'declining writes an audit event');
select throws_ok($$select * from public.cancel_support_appointment((select id from public.appointments where duration_minutes = 30), 2, false)$$, '55000', null, 'a declined appointment is final');
select lives_ok($$select * from public.cancel_support_appointment((select id from public.appointments where duration_minutes = 45), 2, true)$$, 'a household owner cancels and asks for another time');
select is((select cancellation_reason from public.appointments where duration_minutes = 45), 'reschedule_requested', 'the reschedule reason is recorded');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000006';
select lives_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request one'), (now() + interval '10 days')::timestamp, 'UTC', 60, 'phone', null, 'd5000000-0000-4000-8000-000000000030', (select id from public.appointments where duration_minutes = 45))$$, 'the specialist proposes a replacement time');
select is((select supersedes_appointment_id from public.appointments where duration_minutes = 60), (select id from public.appointments where duration_minutes = 45), 'the replacement links to the superseded appointment');
select is((select count(*) from public.appointments where support_thread_id = (select id from public.support_threads where subject = 'Appointment request one')), 2::bigint, 'the original appointment is preserved');
reset role;

-- Automatic cancellation on assignment revocation.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000005';
select lives_ok($$select * from public.revoke_specialist_from_support_request((select id from public.support_threads where subject = 'Appointment request one'), 1)$$, 'the administrator revokes the assignment');
reset role;
select is((select status from public.appointments where duration_minutes = 60), 'cancelled', 'revoking the assignment cancels the live appointment');
select is((select cancellation_reason from public.appointments where duration_minutes = 60), 'assignment_revoked', 'the automatic revocation reason is recorded');
select ok(exists (select 1 from public.appointment_events where reason = 'assignment_revoked'), 'automatic revocation writes an audit event');
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000006';
select is((select count(*) from public.appointments where support_thread_id = (select id from public.support_threads where subject = 'Appointment request one')), 0::bigint, 'the revoked specialist immediately loses appointment access');
reset role;

-- Automatic cancellation on request close.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000006';
select is((select count(*) from public.appointments where support_thread_id = (select id from public.support_threads where subject = 'Appointment request two')), 1::bigint, 'the specialist still sees the other assigned appointment');
reset role;
-- The earlier proposal on request two was declined, so a fresh live one is
-- needed to prove that closing cancels an active appointment.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000006';
select lives_ok($$select * from public.propose_support_appointment((select id from public.support_threads where subject = 'Appointment request two'), (now() + interval '20 days')::timestamp, 'UTC', 60, 'phone', null, 'd5000000-0000-4000-8000-000000000040')$$, 'the specialist proposes a live appointment on the second request');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select lives_ok($$select * from public.close_support_request((select id from public.support_threads where subject = 'Appointment request two'), 1)$$, 'the household closes the second request');
reset role;
select is((select status from public.appointments where support_thread_id = (select id from public.support_threads where subject = 'Appointment request two') and duration_minutes = 60), 'cancelled', 'closing the request cancels its appointment');
select is((select cancellation_reason from public.appointments where support_thread_id = (select id from public.support_threads where subject = 'Appointment request two') and duration_minutes = 60), 'request_closed', 'the close reason is recorded');
select ok(exists (select 1 from public.appointment_events where reason = 'request_closed'), 'closing writes an appointment audit event');

-- Audit visibility.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select ok((select count(*) > 0 from public.appointment_events), 'household readers can read appointment events');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000004';
select is((select count(*) from public.appointment_events), 0::bigint, 'unrelated households cannot read appointment events');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000005';
select ok((select count(*) > 0 from public.appointment_events), 'platform administrators can read appointment events');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000006';
select is((select count(*) from public.appointment_events), 0::bigint, 'a former specialist loses appointment event access');
reset role;

-- Function hygiene, and the scope ETH-027 deliberately excludes.
select ok((
  select count(*) = 7
  from pg_proc as routine
  join pg_namespace as schema on schema.oid = routine.pronamespace
  where schema.nspname = 'public'
    and routine.proname in (
      'propose_support_appointment', 'accept_support_appointment', 'decline_support_appointment',
      'cancel_support_appointment', 'complete_support_appointment', 'get_support_appointment',
      'list_appointment_events'
    )
    and coalesce(array_to_string(routine.proconfig, ','), '') like '%search_path=%'
), 'appointment functions use fixed search paths');
select ok(not has_function_privilege('anon', 'public.propose_support_appointment(uuid, timestamp, text, integer, text, text, uuid, uuid)', 'execute'), 'anonymous users cannot execute proposals');
select ok(has_function_privilege('authenticated', 'public.accept_support_appointment(uuid, integer, text, boolean)', 'execute'), 'authenticated users can execute the guarded consent function');
select ok(not has_table_privilege('authenticated', 'private.appointment_markers', 'insert'), 'browser roles cannot write appointment markers');
select ok(
  (select count(*) from pg_proc as routine
   join pg_namespace as schema on schema.oid = routine.pronamespace
   where schema.nspname in ('public', 'private')
     and routine.proname like '%appointment%'
     and (pg_get_functiondef(routine.oid) like '%household_specialists%'
       or pg_get_functiondef(routine.oid) like '%can_access_household%')) = 0,
  'no appointment function consults household_specialists or can_access_household');
select ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'appointments'
    and (column_name like '%recur%' or column_name like '%rrule%' or column_name like '%external_calendar%')
), 'no recurring or external-calendar columns exist');
select ok(not exists (
  select 1 from pg_proc as routine
  join pg_namespace as schema on schema.oid = routine.pronamespace
  where schema.nspname in ('public', 'private')
    and (routine.proname like '%notif%' or routine.proname like '%recurring%' or routine.proname like '%calendar_sync%')
), 'no notification, recurrence, or calendar-sync function exists');
select ok(not exists (
  select 1 from pg_proc as routine
  join pg_namespace as schema on schema.oid = routine.pronamespace
  where schema.nspname in ('public', 'private')
    and routine.proname like '%appointment%'
    and pg_get_functiondef(routine.oid) ~* '(stripe|subscription|invoice|checkout)'
), 'ETH-027 appointment functions remain free of ETH-028 billing');

-- ETH-026 regression.
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000007';
select is((select count(*) from public.support_threads), 0::bigint, 'ETH-026 unassigned-specialist denial still holds');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000003';
select ok((select count(*) > 0 from public.support_threads), 'ETH-025 viewer read access still works');
reset role;

select * from finish();

rollback;
