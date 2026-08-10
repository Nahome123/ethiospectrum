begin;

select plan(116);

-- Synthetic fixtures only. Household A: owner, household administrator, two
-- members, viewer, and a removed member. Household B: an unrelated owner.
-- Global roles: one platform administrator and one specialist with an ACTIVE
-- dormant assignment to household A, which ETH-025 must still deny.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'support-owner@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'support-admin@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'support-member@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'support-member-two@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'support-viewer@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'support-removed@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'support-outsider@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'support-platform-admin@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'support-specialist@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('82000000-0000-0000-0000-000000000001', 'Support test household', '81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001'),
  ('82000000-0000-0000-0000-000000000002', 'Other support household', '81000000-0000-0000-0000-000000000007', '81000000-0000-0000-0000-000000000007');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'owner', 'active', now()),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 'administrator', 'active', now()),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000003', 'member', 'active', now()),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000004', 'member', 'active', now()),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000005', 'viewer', 'active', now()),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000006', 'member', 'removed', now()),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000007', 'owner', 'active', now());

update public.user_roles set role = 'administrator' where user_id = '81000000-0000-0000-0000-000000000008';
update public.user_roles set role = 'specialist' where user_id = '81000000-0000-0000-0000-000000000009';
insert into public.specialists (id, user_id)
values ('83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000009');
insert into public.household_specialists (household_id, specialist_id, status)
values ('82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 'active');

-- Structure: the dormant foundation tables are reused and extended.
select has_table('public', 'support_threads', 'existing support_threads table is reused');
select has_table('public', 'support_messages', 'existing support_messages table is reused');
select has_table('public', 'support_request_events', 'support request audit table exists');
select has_column('public', 'support_threads', 'subject', 'thread subject column exists');
select has_column('public', 'support_threads', 'category', 'thread category column exists');
select has_column('public', 'support_threads', 'preferred_language', 'thread preferred language column exists');
select has_column('public', 'support_threads', 'expectations_acknowledged_at', 'thread acknowledgment timestamp column exists');
select has_column('public', 'support_threads', 'version', 'thread version column exists');
select has_column('public', 'support_threads', 'closed_at', 'thread closed timestamp column exists');
select has_column('public', 'support_threads', 'cancelled_at', 'thread cancelled timestamp column exists');
select has_column('public', 'support_messages', 'household_id', 'message household column exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.support_threads'::regclass), 'thread RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.support_messages'::regclass), 'message RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.support_request_events'::regclass), 'audit RLS is enabled and forced');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.support_threads'::regclass
    and conname = 'support_threads_status_check'
    and pg_get_constraintdef(oid) like '%cancelled%'
), 'thread status constraint includes cancelled');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'support_threads_creation_idempotency_idx'), 'thread idempotency index exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'support_messages_creation_idempotency_idx'), 'message idempotency index exists');
select ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name in ('support_threads', 'support_messages', 'support_request_events')
    and (column_name like '%dependent%' or column_name like '%document%' or column_name like '%attachment%' or column_name like '%roadmap%' or column_name like '%reminder%')
), 'no dependent, document, roadmap, reminder, or attachment linkage exists');

-- Anonymous denial.
set local role anon;
select throws_ok($$select * from public.support_threads$$, '42501', null, 'anonymous users cannot read support requests');
select throws_ok($$select * from public.support_request_events$$, '42501', null, 'anonymous users cannot read support audit events');
select throws_ok($$
  select * from public.create_support_request('Anonymous subject', 'general', 'en', 'This description is long enough to pass validation.', true, '84000000-0000-0000-0000-0000000000ff')
$$, '42501', null, 'anonymous users cannot execute support request creation');
reset role;

-- Owner creation with server-derived identity and audit trail.
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select lives_ok($$
  select * from public.create_support_request('  Owner support request  ', 'education', 'am', '  We need help understanding a school evaluation letter for our family.  ', true, '84000000-0000-0000-0000-000000000001')
$$, 'owner can create a support request');
select is((select household_id from public.support_threads where subject = 'Owner support request'), '82000000-0000-0000-0000-000000000001'::uuid, 'household identity is derived server-side');
select is((select created_by from public.support_threads where subject = 'Owner support request'), '81000000-0000-0000-0000-000000000001'::uuid, 'requester identity is derived server-side');
select ok((select status = 'open' and version = 1 from public.support_threads where subject = 'Owner support request'), 'a new request is open at version one');
select ok((select expectations_acknowledged_at is not null and expectations_copy_version = 'eth-025.v1' from public.support_threads where subject = 'Owner support request'), 'acknowledgment time and copy version are server-generated');
select is((select count(*) from public.support_messages where support_thread_id = (select id from public.support_threads where subject = 'Owner support request')), 1::bigint, 'creation also creates the initial message');
select ok(exists (
  select 1 from public.support_request_events
  where thread_id = (select id from public.support_threads where subject = 'Owner support request')
    and action = 'created' and to_status = 'open' and request_version = 1
    and actor_user_id = '81000000-0000-0000-0000-000000000001'
), 'creation writes an immutable audit event');
select lives_ok($$
  select * from public.create_support_request('Owner support request', 'education', 'am', 'We need help understanding a school evaluation letter for our family.', true, '84000000-0000-0000-0000-000000000001')
$$, 'duplicate creation key is safely idempotent');
select is((select count(*) from public.support_threads where subject = 'Owner support request'), 1::bigint, 'duplicate creation key creates one request');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000002';
select lives_ok($$
  select * from public.create_support_request('Admin support request', 'benefits', 'en', 'We are trying to understand which benefit programs may apply to us.', true, '84000000-0000-0000-0000-000000000002')
$$, 'household administrator can create a support request');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000003';
select lives_ok($$
  select * from public.create_support_request('Member support request', 'therapy_support', 'es', 'We would like guidance about finding therapy support options nearby.', true, '84000000-0000-0000-0000-000000000003')
$$, 'member can create a support request');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000004';
select lives_ok($$
  select * from public.create_support_request('Second member support request', 'transportation', 'en', 'We need help figuring out transportation options for appointments.', true, '84000000-0000-0000-0000-000000000004')
$$, 'a second member can create a support request');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000005';
select throws_ok($$
  select * from public.create_support_request('Viewer support request', 'general', 'en', 'A viewer should never be able to create this support request.', true, '84000000-0000-0000-0000-000000000005')
$$, '42501', null, 'viewer cannot create a support request');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select throws_ok($$
  select * from public.create_support_request('Hey', 'general', 'en', 'This description is long enough to pass validation checks.', true, '84000000-0000-0000-0000-000000000006')
$$, '22023', null, 'subject bounds are enforced');
select throws_ok($$
  select * from public.create_support_request('Valid subject line', 'general', 'en', 'Too short.', true, '84000000-0000-0000-0000-000000000007')
$$, '22023', null, 'initial description bounds are enforced');
select throws_ok($$
  select * from public.create_support_request('Valid subject line', 'emergency', 'en', 'This description is long enough to pass validation checks.', true, '84000000-0000-0000-0000-000000000008')
$$, '22023', null, 'category allowlist is enforced');
select throws_ok($$
  select * from public.create_support_request('Valid subject line', 'general', 'fr', 'This description is long enough to pass validation checks.', true, '84000000-0000-0000-0000-000000000009')
$$, '22023', null, 'preferred-language allowlist is enforced');
select throws_ok($$
  select * from public.create_support_request('Valid subject line', 'general', 'en', 'This description is long enough to pass validation checks.', false, '84000000-0000-0000-0000-00000000000a')
$$, '22023', null, 'expectations acknowledgment is required');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000007';
select lives_ok($$
  select * from public.create_support_request('Outsider support request', 'general', 'en', 'The unrelated household can create its own support request here.', true, '84000000-0000-0000-0000-00000000000b')
$$, 'an unrelated household owner can create a request in their own household');

-- Household reads and denial matrix.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select is((select count(*) from public.support_threads), 4::bigint, 'owner reads all household requests');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000005';
select is((select count(*) from public.support_threads), 4::bigint, 'viewer reads all household requests');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000006';
select is((select count(*) from public.support_threads), 0::bigint, 'removed member reads no requests');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000007';
select is((select count(*) from public.support_threads where household_id = '82000000-0000-0000-0000-000000000001'), 0::bigint, 'cross-household reads are denied');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000009';
select ok((select public.is_assigned_specialist('82000000-0000-0000-0000-000000000001')), 'the dormant specialist assignment row is active');
select is((select count(*) from public.support_threads), 0::bigint, 'an actively assigned specialist still reads no requests');
select throws_ok($$select * from public.list_support_requests()$$, '42501', null, 'specialist request listing is denied');
select throws_ok($$
  select * from public.get_support_request_messages((select id from public.support_threads where subject = 'Member support request'))
$$, '42501', null, 'specialist message reads are denied');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000008';
select is((select count(*) from public.support_threads), 5::bigint, 'platform administrator reads requests across households');
select is((select count(*) from public.list_support_requests_admin()), 5::bigint, 'platform administrator triage listing works');
select throws_ok($$
  select * from public.create_support_request('Platform admin request', 'general', 'en', 'Platform administrators cannot create household support requests.', true, '84000000-0000-0000-0000-00000000000c')
$$, '42501', null, 'platform administrator cannot create a request');
select throws_ok($$
  select * from public.add_support_request_message((select id from public.support_threads where subject = 'Member support request'), 'Platform admin reply attempt.', '84000000-0000-0000-0000-00000000000d')
$$, '42501', null, 'platform administrator cannot add a message');
select throws_ok($$
  select * from public.close_support_request((select id from public.support_threads where subject = 'Member support request'), 1)
$$, '42501', null, 'platform administrator cannot close a request');

-- Messages.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select lives_ok($$
  select * from public.add_support_request_message((select id from public.support_threads where subject = 'Member support request'), 'Owner follow-up on the member request.', '84000000-0000-0000-0000-000000000011')
$$, 'owner can add a follow-up message');
select is((select count(*) from public.support_messages where support_thread_id = (select id from public.support_threads where subject = 'Member support request')), 2::bigint, 'the follow-up message is stored');
select lives_ok($$
  select * from public.add_support_request_message((select id from public.support_threads where subject = 'Member support request'), 'Owner follow-up on the member request.', '84000000-0000-0000-0000-000000000011')
$$, 'duplicate message key is safely idempotent');
select is((select count(*) from public.support_messages where support_thread_id = (select id from public.support_threads where subject = 'Member support request')), 2::bigint, 'duplicate message key stores one message');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000002';
select lives_ok($$
  select * from public.add_support_request_message((select id from public.support_threads where subject = 'Member support request'), 'Administrator follow-up message.', '84000000-0000-0000-0000-000000000012')
$$, 'household administrator can add a follow-up message');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000003';
select lives_ok($$
  select * from public.add_support_request_message((select id from public.support_threads where subject = 'Member support request'), 'Requester follow-up message.', '84000000-0000-0000-0000-000000000013')
$$, 'member can add a follow-up message');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000005';
select throws_ok($$
  select * from public.add_support_request_message((select id from public.support_threads where subject = 'Member support request'), 'Viewer message attempt.', '84000000-0000-0000-0000-000000000014')
$$, '42501', null, 'viewer cannot add a message');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000007';
select throws_ok($$
  select * from public.add_support_request_message((select id from public.support_threads where subject = 'Member support request'), 'Cross-household message attempt.', '84000000-0000-0000-0000-000000000015')
$$, '42501', null, 'unrelated households cannot add a message');
reset role;
select ok(exists (
  select 1 from public.support_request_events
  where thread_id = (select id from public.support_threads where subject = 'Member support request')
    and action = 'message_added' and (safe_metadata ->> 'message_sequence') = '2'
), 'message additions write bounded audit metadata');

-- Lifecycle authority.
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000004';
select throws_ok($$
  select * from public.close_support_request((select id from public.support_threads where subject = 'Member support request'), 1)
$$, '42501', null, 'a member cannot close another member''s request');
select throws_ok($$
  select * from public.cancel_support_request((select id from public.support_threads where subject = 'Member support request'), 1)
$$, '42501', null, 'a member cannot cancel another member''s request');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select throws_ok($$
  select * from public.close_support_request((select id from public.support_threads where subject = 'Second member support request'), 99)
$$, '40001', null, 'a stale expected version is rejected');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000003';
select lives_ok($$
  select * from public.close_support_request((select id from public.support_threads where subject = 'Member support request'), 1)
$$, 'the requester can close their own request');
select ok((
  select status = 'closed' and closed_by = '81000000-0000-0000-0000-000000000003' and closed_at is not null and version = 2
  from public.support_threads where subject = 'Member support request'
), 'closing stores server-derived lifecycle fields');
select ok(exists (
  select 1 from public.support_request_events
  where thread_id = (select id from public.support_threads where subject = 'Member support request')
    and action = 'closed' and from_status = 'open' and to_status = 'closed' and request_version = 2
), 'closing writes an audit event');
select throws_ok($$
  select * from public.add_support_request_message((select id from public.support_threads where subject = 'Member support request'), 'Message after closing.', '84000000-0000-0000-0000-000000000016')
$$, '55000', null, 'a closed request cannot receive messages');
select throws_ok($$
  select * from public.close_support_request((select id from public.support_threads where subject = 'Member support request'), 2)
$$, '55000', null, 'a closed request cannot be closed again');
select throws_ok($$
  update public.support_threads set status = 'open' where subject = 'Member support request'
$$, '42501', null, 'browser clients cannot reopen a request');
reset role;
select throws_ok($$
  update public.support_threads set status = 'open', closed_at = null, closed_by = null, version = version + 1 where subject = 'Member support request'
$$, '55000', null, 'even elevated writes cannot reopen a closed request');

set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select lives_ok($$
  select * from public.close_support_request((select id from public.support_threads where subject = 'Second member support request'), 1)
$$, 'the owner can close another member''s request');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000003';
select lives_ok($$
  select * from public.create_support_request('Member cancellation request', 'housing', 'en', 'This request will be cancelled by the requester as a mistake.', true, '84000000-0000-0000-0000-000000000021')
$$, 'member creates a request to cancel');
select lives_ok($$
  select * from public.cancel_support_request((select id from public.support_threads where subject = 'Member cancellation request'), 1)
$$, 'the requester can cancel their own request');
select ok((
  select status = 'cancelled' and cancelled_by = '81000000-0000-0000-0000-000000000003' and cancelled_at is not null and version = 2
  from public.support_threads where subject = 'Member cancellation request'
), 'cancelling stores server-derived lifecycle fields');
select ok(exists (
  select 1 from public.support_request_events
  where thread_id = (select id from public.support_threads where subject = 'Member cancellation request')
    and action = 'cancelled' and from_status = 'open' and to_status = 'cancelled' and request_version = 2
), 'cancelling writes an audit event');
select throws_ok($$
  select * from public.add_support_request_message((select id from public.support_threads where subject = 'Member cancellation request'), 'Message after cancelling.', '84000000-0000-0000-0000-000000000022')
$$, '55000', null, 'a cancelled request cannot receive messages');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000004';
select lives_ok($$
  select * from public.create_support_request('Admin closes this request', 'general', 'en', 'A household administrator will close this member request shortly.', true, '84000000-0000-0000-0000-000000000023')
$$, 'member creates a request for administrator closing');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000002';
select lives_ok($$
  select * from public.close_support_request((select id from public.support_threads where subject = 'Admin closes this request'), 1)
$$, 'a household administrator can close another member''s request');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000003';
select lives_ok($$
  select * from public.create_support_request('Owner cancels this request', 'general', 'en', 'The household owner will cancel this member request shortly.', true, '84000000-0000-0000-0000-000000000024')
$$, 'member creates a request for owner cancellation');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select lives_ok($$
  select * from public.cancel_support_request((select id from public.support_threads where subject = 'Owner cancels this request'), 1)
$$, 'the owner can cancel another member''s request');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000004';
select lives_ok($$
  select * from public.create_support_request('Admin cancels this request', 'general', 'en', 'A household administrator will cancel this member request shortly.', true, '84000000-0000-0000-0000-000000000025')
$$, 'member creates a request for administrator cancellation');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000002';
select lives_ok($$
  select * from public.cancel_support_request((select id from public.support_threads where subject = 'Admin cancels this request'), 1)
$$, 'a household administrator can cancel another member''s request');

-- Abuse bounds.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select lives_ok($$
  select * from public.create_support_request('Owner cap request three', 'general', 'en', 'This synthetic request helps exercise the open-request limit.', true, '84000000-0000-0000-0000-000000000031')
$$, 'the third open request is allowed');
select lives_ok($$
  select * from public.create_support_request('Owner cap request four', 'general', 'en', 'This synthetic request helps exercise the open-request limit.', true, '84000000-0000-0000-0000-000000000032')
$$, 'the fourth open request is allowed');
select lives_ok($$
  select * from public.create_support_request('Owner cap request five', 'general', 'en', 'This synthetic request helps exercise the open-request limit.', true, '84000000-0000-0000-0000-000000000033')
$$, 'the fifth open request is allowed');
select throws_ok($$
  select * from public.create_support_request('Owner cap request six', 'general', 'en', 'This synthetic request must exceed the open-request limit.', true, '84000000-0000-0000-0000-000000000034')
$$, '54000', null, 'the open-request cap is enforced');
reset role;
insert into public.support_messages (support_thread_id, household_id, sender_id, content)
select thread.id, thread.household_id, thread.created_by, 'Synthetic cap message ' || series.i
from public.support_threads as thread, generate_series(1, 49) as series(i)
where thread.subject = 'Admin support request';
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000002';
select throws_ok($$
  select * from public.add_support_request_message((select id from public.support_threads where subject = 'Admin support request'), 'Message over the cap.', '84000000-0000-0000-0000-000000000035')
$$, '54000', null, 'the per-request message cap is enforced');

-- Browser forgery denial: no direct writes exist.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select throws_ok($$
  insert into public.support_threads (household_id, created_by, subject, category, preferred_language, expectations_acknowledged_at, expectations_copy_version)
  values ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 'Forged direct thread', 'general', 'en', now(), 'forged')
$$, '42501', null, 'browser user and household forgery is denied on insert');
select throws_ok($$
  update public.support_threads set status = 'cancelled' where subject = 'Owner support request'
$$, '42501', null, 'browser status forgery is denied');
select throws_ok($$
  update public.support_threads set specialist_id = '83000000-0000-0000-0000-000000000001' where subject = 'Owner support request'
$$, '42501', null, 'browser specialist assignment forgery is denied');
select throws_ok($$
  insert into public.support_messages (support_thread_id, household_id, sender_id, content)
  values ((select id from public.support_threads where subject = 'Owner support request'), '82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Forged direct message')
$$, '42501', null, 'direct message inserts are denied');
select throws_ok($$
  update public.support_messages set content = 'Edited message' where content = 'Owner follow-up on the member request.'
$$, '42501', null, 'message updates are denied');
select throws_ok($$
  delete from public.support_messages where content = 'Owner follow-up on the member request.'
$$, '42501', null, 'message deletes are denied');
select throws_ok($$
  insert into public.support_request_events (thread_id, household_id, actor_user_id, action, request_version)
  values ((select id from public.support_threads where subject = 'Owner support request'), '82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'created', 1)
$$, '42501', null, 'direct audit inserts are denied');
select throws_ok($$
  update public.support_request_events set action = 'cancelled' where action = 'created'
$$, '42501', null, 'audit updates are denied');
select throws_ok($$
  delete from public.support_request_events where action = 'created'
$$, '42501', null, 'audit deletes are denied');
select throws_ok($$
  delete from public.support_threads where subject = 'Owner support request'
$$, '42501', null, 'requests cannot be hard deleted through the application');
reset role;
select throws_ok($$
  update public.support_threads set specialist_id = '83000000-0000-0000-0000-000000000001' where subject = 'Owner support request'
$$, '42501', null, 'even elevated writes cannot assign a specialist in ETH-025');
select throws_ok($$
  update public.support_messages set content = 'Elevated edit' where content = 'Owner follow-up on the member request.'
$$, '42501', null, 'even elevated writes cannot edit messages');

-- Audit visibility.
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000005';
select ok((select count(*) > 0 from public.support_request_events where household_id = '82000000-0000-0000-0000-000000000001'), 'household readers can read audit events');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000007';
select is((select count(*) from public.support_request_events where household_id = '82000000-0000-0000-0000-000000000001'), 0::bigint, 'unrelated households cannot read audit events');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000008';
select ok((select count(*) > 0 from public.support_request_events), 'platform administrators can read audit events');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000009';
select is((select count(*) from public.support_request_events), 0::bigint, 'specialists cannot read audit events');
reset role;

-- Function hygiene and boundaries.
select ok((
  select count(*) = 12
  from pg_proc as routine
  join pg_namespace as schema on schema.oid = routine.pronamespace
  where (
      (schema.nspname = 'public' and routine.proname in (
        'create_support_request', 'add_support_request_message', 'close_support_request',
        'cancel_support_request', 'list_support_requests', 'get_support_request_messages',
        'list_support_requests_admin'
      ))
      or (schema.nspname = 'private' and routine.proname in (
        'transition_support_request', 'current_support_permission',
        'support_thread_integrity', 'support_message_integrity', 'support_event_immutable'
      ))
    )
    and coalesce(array_to_string(routine.proconfig, ','), '') like '%search_path=%'
), 'support functions use fixed search paths');
select ok(not has_function_privilege('anon', 'public.create_support_request(text, text, text, text, boolean, uuid)', 'execute'), 'anonymous users cannot execute request creation');
select ok(has_function_privilege('authenticated', 'public.create_support_request(text, text, text, text, boolean, uuid)', 'execute'), 'authenticated users can execute request creation');
select ok(not has_function_privilege('authenticated', 'private.transition_support_request(uuid, integer, text)', 'execute'), 'the private transition helper is not browser-executable');
-- ETH-026 adds assignment as a separate, request-level grant. These guards keep
-- that boundary honest: ETH-025's own functions never grant specialist access,
-- assignment is request-level rather than household-wide, and ETH-027
-- appointment scheduling remains absent.
select ok(
  (select count(*) from pg_proc as routine
   join pg_namespace as schema on schema.oid = routine.pronamespace
   where schema.nspname in ('public', 'private')
     and routine.proname in (
       'create_support_request', 'add_support_request_message',
       'close_support_request', 'cancel_support_request'
     )
     and pg_get_functiondef(routine.oid) like '%specialist_id%') = 0,
  'ETH-025 caregiver functions never grant specialist access themselves');
-- The household payload may name the assigned specialist but never exposes an
-- internal specialist identifier.
select ok(
  (select count(*) from information_schema.columns
   where table_schema = 'public'
     and table_name = 'support_threads'
     and column_name = 'specialist_id') = 1,
  'ETH-026 assignment is request-level on support_threads');
-- ETH-027 owns appointments; ETH-025's caregiver functions must not schedule.
select ok(
  (select count(*) from pg_proc as routine
   join pg_namespace as schema on schema.oid = routine.pronamespace
   where schema.nspname in ('public', 'private')
     and routine.proname in (
       'create_support_request', 'add_support_request_message', 'close_support_request',
       'cancel_support_request'
     )
     and pg_get_functiondef(routine.oid) like '%public.appointments%') = 0,
  'ETH-025 caregiver functions do not schedule appointments themselves');
select is((select count(*) from public.support_threads where specialist_id is not null), 0::bigint, 'ETH-025 never populates the dormant specialist field');

-- ETH-008 and ETH-009 regression checks.
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anonymous users still cannot read profiles');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000007';
select is((select count(*) from public.household_members where household_id = '82000000-0000-0000-0000-000000000001'), 0::bigint, 'household membership isolation still holds');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000006';
select is((select count(*) from public.households where id = '82000000-0000-0000-0000-000000000001'), 0::bigint, 'removed members still cannot read the household');
reset role;

select * from finish();

rollback;
