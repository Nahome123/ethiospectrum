begin;

select plan(119);

-- Synthetic fixtures only. Household A: owner, member, viewer. Household B: an
-- unrelated owner. Global roles: one platform administrator, two specialists,
-- and one content editor. Household A also carries an ACTIVE dormant
-- household_specialists row, which must never grant ETH-026 access.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'assign-owner@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'assign-member@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'assign-viewer@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'assign-outsider@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'assign-platform-admin@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'assign-specialist-one@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'assign-specialist-two@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'assign-editor@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'assign-unavailable@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'assign-household-admin@example.test', 'x', now(), '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('a2000000-0000-4000-8000-000000000001', 'Assignment household', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002', 'Other assignment household', 'a1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'member', 'active', now()),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'viewer', 'active', now()),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a', 'administrator', 'active', now()),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000004', 'owner', 'active', now());

update public.user_roles set role = 'administrator' where user_id = 'a1000000-0000-4000-8000-000000000005';
update public.user_roles set role = 'specialist' where user_id = 'a1000000-0000-4000-8000-000000000006';
update public.user_roles set role = 'specialist' where user_id = 'a1000000-0000-4000-8000-000000000007';
update public.user_roles set role = 'content_editor' where user_id = 'a1000000-0000-4000-8000-000000000008';
update public.user_roles set role = 'specialist' where user_id = 'a1000000-0000-4000-8000-000000000009';

insert into public.specialists (id, user_id, availability_status)
values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', 'available'),
  ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000007', 'available'),
  ('a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000009', 'unavailable');

-- The dormant household-wide assignment must never become an access path.
insert into public.household_specialists (household_id, specialist_id, status)
values ('a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'active');

-- Structure.
select has_table('public', 'specialists', 'existing specialists table is reused');
select has_table('public', 'support_threads', 'existing support_threads table is reused');
select has_table('public', 'support_messages', 'existing support_messages table is reused');
select has_table('public', 'support_request_assignment_events', 'assignment audit table exists');
select has_column('public', 'support_threads', 'specialist_id', 'existing specialist column is reused');
select has_column('public', 'support_threads', 'specialist_assigned_at', 'assignment timestamp column exists');
select has_column('public', 'support_threads', 'specialist_assigned_by', 'assignment actor column exists');
select has_column('public', 'support_threads', 'assignment_version', 'assignment version column exists');
select has_column('public', 'support_threads', 'assignment_updated_at', 'assignment update column exists');
select has_column('public', 'support_messages', 'author_kind', 'message author kind column exists');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.support_messages'::regclass
    and conname = 'support_messages_author_kind_valid'
), 'author kind allowlist constraint exists');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.support_threads'::regclass
    and conname = 'support_threads_assignment_valid'
), 'assignment consistency constraint exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'support_threads_assigned_specialist_idx'), 'specialist workload index exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'support_request_assignment_events_thread_idx'), 'assignment audit index exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.support_request_assignment_events'::regclass), 'assignment audit RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.support_threads'::regclass), 'support thread RLS remains enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.support_messages'::regclass), 'support message RLS remains enabled and forced');

-- Household A creates two open requests; household B creates one.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select lives_ok($$
  select * from public.create_support_request('Assignment request one', 'education', 'en', 'A synthetic request used to exercise specialist assignment.', true, 'a4000000-0000-4000-8000-000000000001')
$$, 'household owner creates the first request');
select lives_ok($$
  select * from public.create_support_request('Assignment request two', 'benefits', 'en', 'A second synthetic request used for unrelated-scope checks.', true, 'a4000000-0000-4000-8000-000000000002')
$$, 'household owner creates a second request');
select is((select author_kind from public.support_messages where content like 'A synthetic request used%'), 'caregiver', 'existing messages are backfilled as caregiver');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000004';
select lives_ok($$
  select * from public.create_support_request('Other household request', 'general', 'en', 'An unrelated household request for cross-household checks.', true, 'a4000000-0000-4000-8000-000000000003')
$$, 'unrelated household owner creates a request');
reset role;

-- Assignment authority.
set local role anon;
select throws_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'a3000000-0000-4000-8000-000000000001', 0)
$$, '42501', null, 'anonymous users cannot assign a specialist');
select throws_ok($$select * from public.support_request_assignment_events$$, '42501', null, 'anonymous users cannot read assignment history');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select throws_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'a3000000-0000-4000-8000-000000000001', 0)
$$, '42501', null, 'household owner cannot assign a specialist');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-00000000000a';
select throws_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'a3000000-0000-4000-8000-000000000001', 0)
$$, '42501', null, 'household administrator cannot assign a specialist');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';
select throws_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'a3000000-0000-4000-8000-000000000001', 0)
$$, '42501', null, 'household member cannot assign a specialist');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000003';
select throws_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'a3000000-0000-4000-8000-000000000001', 0)
$$, '42501', null, 'household viewer cannot assign a specialist');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000006';
select throws_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'a3000000-0000-4000-8000-000000000001', 0)
$$, '42501', null, 'a specialist cannot assign themselves');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000008';
select throws_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'a3000000-0000-4000-8000-000000000001', 0)
$$, '42501', null, 'the content editor cannot assign a specialist');
select throws_ok($$select * from public.list_assignable_specialists()$$, '42501', null, 'the content editor cannot read the specialist directory');
reset role;

-- Specialist access before assignment.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000006';
select is((select count(*) from public.support_threads), 0::bigint, 'an unassigned specialist reads no support requests');
select is((select count(*) from public.support_messages), 0::bigint, 'an unassigned specialist reads no support messages');
select is((select count(*) from public.list_specialist_support_requests(1)), 0::bigint, 'an unassigned specialist has an empty workload');
reset role;

-- The dormant household-wide row grants nothing.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000007';
select ok((select public.is_assigned_specialist('a2000000-0000-4000-8000-000000000001')), 'the dormant household_specialists row is active');
select is((select count(*) from public.support_threads), 0::bigint, 'an active household_specialists row alone grants no request access');
select is((select count(*) from public.list_specialist_support_requests(1)), 0::bigint, 'an active household_specialists row alone grants no workload');
reset role;

-- Platform administrator assignment.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000005';
select throws_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'a3000000-0000-4000-8000-000000000003', 0)
$$, '22023', null, 'an unavailable specialist cannot be assigned');
select throws_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'a3000000-0000-4000-8000-000000000001', 5)
$$, '40001', null, 'a stale expected assignment version is rejected');
select lives_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'a3000000-0000-4000-8000-000000000001', 0)
$$, 'a platform administrator assigns an eligible specialist');
select is((select specialist_id from public.support_threads where subject = 'Assignment request one'), 'a3000000-0000-4000-8000-000000000001'::uuid, 'the assignment stores the specialist');
select is((select assignment_version from public.support_threads where subject = 'Assignment request one'), 1, 'assignment increments the version');
select is((select specialist_assigned_by from public.support_threads where subject = 'Assignment request one'), 'a1000000-0000-4000-8000-000000000005'::uuid, 'the assigning actor is derived server-side');
select ok((select specialist_assigned_at is not null from public.support_threads where subject = 'Assignment request one'), 'the assignment timestamp is server-generated');
select throws_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'a3000000-0000-4000-8000-000000000002', 1)
$$, '23505', null, 'a request cannot hold a second active specialist');
select lives_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request two'),
    'a3000000-0000-4000-8000-000000000001', 0)
$$, 'one specialist may hold multiple request assignments');
select lives_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Other household request'),
    'a3000000-0000-4000-8000-000000000002', 0)
$$, 'a second specialist is assigned in the unrelated household');
select ok(exists (
  select 1 from public.support_request_assignment_events
  where action = 'assigned' and assignment_version = 1
    and actor_user_id = 'a1000000-0000-4000-8000-000000000005'
    and specialist_id = 'a3000000-0000-4000-8000-000000000001'
), 'assignment writes an audit event');
select is((select count(*) from public.support_request_assignment_events where action = 'assigned'), 3::bigint, 'each assignment writes exactly one audit event');
reset role;

-- Assigned specialist scope.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000006';
select is((select count(*) from public.support_threads), 2::bigint, 'an assigned specialist reads only their assigned requests');
select is((select count(*) from public.list_specialist_support_requests(1)), 2::bigint, 'the workload lists only assigned open requests');
select ok((select count(*) > 0 from public.support_messages where support_thread_id = (select id from public.support_threads where subject = 'Assignment request one')), 'an assigned specialist reads that request''s messages');
select is((select count(*) from public.support_threads where subject = 'Other household request'), 0::bigint, 'an assigned specialist cannot read another household''s request');
select is((select count(*) from public.get_specialist_support_request((select id from public.support_threads where household_id = 'a2000000-0000-4000-8000-000000000002' limit 1))), 0::bigint, 'the specialist detail function hides unrelated requests');
select is((select count(*) from public.dependents), 0::bigint, 'an assigned specialist reads no dependents');
select is((select count(*) from public.documents), 0::bigint, 'an assigned specialist reads no documents');
select is((select count(*) from public.roadmap_items), 0::bigint, 'an assigned specialist reads no roadmap items');
select is((select count(*) from public.reminders), 0::bigint, 'an assigned specialist reads no reminders');
select is((select count(*) from public.household_members where household_id = 'a2000000-0000-4000-8000-000000000001'), 0::bigint, 'an assigned specialist reads no household membership');
select is((select count(*) from public.support_request_assignment_events), 0::bigint, 'an assigned specialist cannot read assignment history');
select throws_ok($$
  select * from public.list_support_request_assignment_events((select id from public.support_threads where subject = 'Assignment request one'))
$$, '42501', null, 'an assigned specialist cannot call the assignment history function');
select lives_ok($$
  select * from public.add_specialist_support_message(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'A synthetic specialist response.', 'a5000000-0000-4000-8000-000000000001')
$$, 'an assigned specialist adds a response');
select is((select author_kind from public.support_messages where content = 'A synthetic specialist response.'), 'specialist', 'specialist author kind is derived server-side');
select is((select sender_id from public.support_messages where content = 'A synthetic specialist response.'), 'a1000000-0000-4000-8000-000000000006'::uuid, 'specialist author identity is derived server-side');
select lives_ok($$
  select * from public.add_specialist_support_message(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'A synthetic specialist response.', 'a5000000-0000-4000-8000-000000000001')
$$, 'duplicate specialist message key is safely idempotent');
select is((select count(*) from public.support_messages where content = 'A synthetic specialist response.'), 1::bigint, 'duplicate specialist message key stores one message');
select throws_ok($$
  select * from public.add_specialist_support_message(
    (select id from public.support_threads where household_id = 'a2000000-0000-4000-8000-000000000002' limit 1),
    'Cross-household response attempt.', 'a5000000-0000-4000-8000-000000000002')
$$, '42501', null, 'a specialist cannot respond to an unassigned request');
select throws_ok($$
  select * from public.close_support_request((select id from public.support_threads where subject = 'Assignment request one'), 1)
$$, '42501', null, 'a specialist cannot close a request');
select throws_ok($$
  select * from public.cancel_support_request((select id from public.support_threads where subject = 'Assignment request one'), 1)
$$, '42501', null, 'a specialist cannot cancel a request');
select throws_ok($$
  select * from public.revoke_specialist_from_support_request((select id from public.support_threads where subject = 'Assignment request one'), 1)
$$, '42501', null, 'a specialist cannot revoke their own assignment');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000007';
select throws_ok($$
  select * from public.add_specialist_support_message(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'Unassigned specialist response.', 'a5000000-0000-4000-8000-000000000003')
$$, '42501', null, 'an unassigned specialist cannot respond');
reset role;

-- The household sees the specialist response and safe assignment name.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select ok(exists (
  select 1 from public.get_support_request_messages((select id from public.support_threads where subject = 'Assignment request one'))
  where author_kind = 'specialist'
), 'the household reads the specialist response');
select ok((
  select assigned_specialist_name is not null
  from public.list_support_requests(null, null, 1, (select id from public.support_threads where subject = 'Assignment request one'))
), 'the household sees the assigned specialist safe name');
select throws_ok($$
  select * from public.list_support_request_assignment_events((select id from public.support_threads where subject = 'Assignment request one'))
$$, '42501', null, 'the household cannot read assignment history');
select is((select count(*) from public.support_request_assignment_events), 0::bigint, 'household RLS hides assignment audit rows');
reset role;

-- Administrator revocation removes access immediately.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000005';
select ok((select count(*) > 0 from public.support_request_assignment_events), 'a platform administrator reads assignment history');
select throws_ok($$
  select * from public.revoke_specialist_from_support_request((select id from public.support_threads where subject = 'Assignment request two'), 9)
$$, '40001', null, 'a stale revocation version is rejected');
select lives_ok($$
  select * from public.revoke_specialist_from_support_request((select id from public.support_threads where subject = 'Assignment request two'), 1)
$$, 'a platform administrator revokes an assignment');
select ok((
  select specialist_id is null and specialist_assigned_at is null and specialist_assigned_by is null and assignment_version = 2
  from public.support_threads where subject = 'Assignment request two'
), 'revocation clears the assignment and increments the version');
select ok(exists (
  select 1 from public.support_request_assignment_events
  where action = 'revoked' and reason = 'administrator_revoked' and assignment_version = 2
), 'administrator revocation writes an audit event');
select throws_ok($$
  select * from public.revoke_specialist_from_support_request((select id from public.support_threads where subject = 'Assignment request two'), 2)
$$, '55000', null, 'revoking an unassigned request is rejected');
-- A second administrator holding the pre-revocation version must be told the
-- assignment changed elsewhere, not that it never existed.
select throws_ok($$
  select * from public.revoke_specialist_from_support_request((select id from public.support_threads where subject = 'Assignment request two'), 1)
$$, '40001', null, 'a concurrent revocation reports the stale assignment version');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';
select throws_ok($$
  select * from public.revoke_specialist_from_support_request((select id from public.support_threads where subject = 'Assignment request one'), 1)
$$, '42501', null, 'a household member cannot revoke an assignment');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000006';
select is((select count(*) from public.support_threads where subject = 'Assignment request two'), 0::bigint, 'revocation immediately removes thread read access');
select is((select count(*) from public.support_messages where support_thread_id = (select id from public.support_threads where subject = 'Assignment request two')), 0::bigint, 'revocation immediately removes message read access');
select is((select count(*) from public.list_specialist_support_requests(1)), 1::bigint, 'the revoked request leaves the specialist workload immediately');
select throws_ok($$
  select * from public.add_specialist_support_message(
    (select id from public.support_threads where subject = 'Assignment request two'),
    'Response after revocation.', 'a5000000-0000-4000-8000-000000000004')
$$, '42501', null, 'revocation immediately removes message write access');
reset role;

-- Closing a request automatically revokes its assignment.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select lives_ok($$
  select * from public.close_support_request((select id from public.support_threads where subject = 'Assignment request one'), 1)
$$, 'the household closes the assigned request');
select ok((
  select specialist_id is null and assignment_version = 2 and status = 'closed'
  from public.support_threads where subject = 'Assignment request one'
), 'closing clears the assignment atomically');
reset role;
select ok(exists (
  select 1 from public.support_request_assignment_events
  where reason = 'request_closed' and action = 'revoked'
), 'closing writes an automatic revocation audit event');

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000006';
select is((select count(*) from public.support_threads), 0::bigint, 'the specialist loses access when the request closes');
select throws_ok($$
  select * from public.add_specialist_support_message(
    (select id from public.support_threads where subject = 'Assignment request one'),
    'Response after close.', 'a5000000-0000-4000-8000-000000000005')
$$, '42501', null, 'a closed request rejects specialist responses');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select ok(exists (
  select 1 from public.get_support_request_messages((select id from public.support_threads where subject = 'Assignment request one'))
  where author_kind = 'specialist'
), 'specialist messages remain visible to the household after closing');
reset role;

-- Cancelling also revokes automatically.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000005';
select lives_ok($$
  select * from public.assign_specialist_to_support_request(
    (select id from public.support_threads where subject = 'Assignment request two'),
    'a3000000-0000-4000-8000-000000000001', 2)
$$, 'a previously revoked specialist can be assigned again');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select lives_ok($$
  select * from public.cancel_support_request((select id from public.support_threads where subject = 'Assignment request two'), 1)
$$, 'the household cancels the reassigned request');
reset role;
select ok(exists (
  select 1 from public.support_request_assignment_events
  where reason = 'request_cancelled' and action = 'revoked'
), 'cancelling writes an automatic revocation audit event');
select ok((
  select specialist_id is null and assignment_version = 4
  from public.support_threads where subject = 'Assignment request two'
), 'cancelling clears the assignment and increments the version');

-- Forgery, immutability, and hygiene.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000005';
select throws_ok($$
  update public.support_threads set specialist_id = 'a3000000-0000-4000-8000-000000000001'
  where subject = 'Other household request'
$$, '42501', null, 'browser clients cannot forge an assignment');
select throws_ok($$
  insert into public.support_request_assignment_events (thread_id, household_id, specialist_id, actor_user_id, action, assignment_version)
  values ((select id from public.support_threads where subject = 'Other household request'), 'a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000005', 'assigned', 9)
$$, '42501', null, 'browser clients cannot forge assignment audit rows');
select throws_ok($$
  update public.support_request_assignment_events set action = 'assigned'
$$, '42501', null, 'assignment audit updates are denied');
select throws_ok($$
  delete from public.support_request_assignment_events
$$, '42501', null, 'assignment audit deletes are denied');
select throws_ok($$
  insert into public.support_messages (support_thread_id, household_id, sender_id, content, author_kind)
  values ((select id from public.support_threads where subject = 'Other household request'), 'a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000005', 'Forged specialist message', 'specialist')
$$, '42501', null, 'browser clients cannot forge a specialist message');
reset role;

-- 'Other household request' currently holds specialist two; changing it to
-- specialist one is a real assignment change and must still require the marker.
select throws_ok($$
  update public.support_threads set specialist_id = 'a3000000-0000-4000-8000-000000000001'
  where subject = 'Other household request'
$$, '42501', null, 'even elevated writes cannot bypass the assignment marker');
select throws_ok($$
  update public.support_threads set assignment_version = 99
  where subject = 'Other household request'
$$, '42501', null, 'even elevated writes cannot forge an assignment version');
select throws_ok($$
  insert into public.support_messages (support_thread_id, household_id, sender_id, content, author_kind)
  values ((select id from public.support_threads where subject = 'Other household request'), 'a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'Forged elevated specialist message', 'specialist')
$$, '42501', null, 'even elevated writes cannot forge specialist authorship');
select throws_ok($$
  update public.support_request_assignment_events set reason = 'administrator_revoked'
$$, '42501', null, 'even elevated writes cannot alter assignment audit rows');

select ok((
  select count(*) = 9
  from pg_proc as routine
  join pg_namespace as schema on schema.oid = routine.pronamespace
  where (
      (schema.nspname = 'public' and routine.proname in (
        'assign_specialist_to_support_request', 'revoke_specialist_from_support_request',
        'add_specialist_support_message', 'list_assignable_specialists',
        'get_support_request_assignment', 'list_support_request_assignment_events',
        'list_specialist_support_requests', 'get_specialist_support_request'
      ))
      or (schema.nspname = 'private' and routine.proname = 'is_assigned_open_request_specialist')
    )
    and coalesce(array_to_string(routine.proconfig, ','), '') like '%search_path=%'
), 'ETH-026 functions use fixed search paths');
select ok(not has_function_privilege('anon', 'public.assign_specialist_to_support_request(uuid, uuid, integer)', 'execute'), 'anonymous users cannot execute assignment');
select ok(has_function_privilege('authenticated', 'public.assign_specialist_to_support_request(uuid, uuid, integer)', 'execute'), 'authenticated users may call the guarded assignment function');
select ok(not has_function_privilege('authenticated', 'private.revoke_support_request_specialist(public.support_threads, uuid, text)', 'execute'), 'the private revocation helper is not browser-executable');
select ok(not has_table_privilege('authenticated', 'private.support_assignment_markers', 'insert'), 'browser roles cannot write assignment markers');

-- household_specialists is never consulted for ETH-026 authorization.
select ok(
  (select count(*) from pg_proc as routine
   join pg_namespace as schema on schema.oid = routine.pronamespace
   where schema.nspname in ('public', 'private')
     and routine.proname in (
       'assign_specialist_to_support_request', 'revoke_specialist_from_support_request',
       'add_specialist_support_message', 'is_assigned_open_request_specialist',
       'list_specialist_support_requests', 'get_specialist_support_request'
     )
     and (pg_get_functiondef(routine.oid) like '%household_specialists%'
       or pg_get_functiondef(routine.oid) like '%can_access_household%')) = 0,
  'ETH-026 functions never consult household_specialists or can_access_household');
select is((select count(*) from public.household_specialists where status = 'active'), 1::bigint, 'the dormant household_specialists row is untouched by ETH-026');
select ok(
  (select count(*) from pg_policies
   where schemaname = 'public'
     and tablename in ('support_threads', 'support_messages', 'support_request_assignment_events')
     and (qual like '%can_access_household%' or qual like '%household_specialists%')) = 0,
  'support policies never use can_access_household or household_specialists');

-- ETH-025 regression and ETH-027 absence.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000003';
select ok((select count(*) > 0 from public.support_threads), 'ETH-025 viewer read access still works');
select throws_ok($$
  select * from public.add_support_request_message((select id from public.support_threads where subject = 'Other household request'), 'Viewer message.', 'a5000000-0000-4000-8000-000000000009')
$$, '42501', null, 'ETH-025 viewer write denial still holds');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000004';
select is((select count(*) from public.support_threads where household_id = 'a2000000-0000-4000-8000-000000000001'), 0::bigint, 'ETH-025 cross-household isolation still holds');
reset role;
-- ETH-027 now owns appointments. Assignment itself must still never schedule:
-- ETH-026's own functions stay free of appointment behavior, and ETH-028
-- billing remains outside the ETH-026 functions.
select ok(
  (select count(*) from pg_proc as routine
   join pg_namespace as schema on schema.oid = routine.pronamespace
   where schema.nspname in ('public', 'private')
     and routine.proname in (
       'assign_specialist_to_support_request', 'revoke_specialist_from_support_request',
       'add_specialist_support_message'
     )
     and pg_get_functiondef(routine.oid) like '%public.appointments%'
     and routine.proname <> 'revoke_specialist_from_support_request') = 0,
  'ETH-026 assignment functions do not schedule appointments themselves');
select ok(not exists (
  select 1 from pg_proc as routine
  join pg_namespace as schema on schema.oid = routine.pronamespace
  where schema.nspname in ('public', 'private')
    and routine.proname in (
      'assign_specialist_to_support_request', 'revoke_specialist_from_support_request',
      'add_specialist_support_message'
    )
    and pg_get_functiondef(routine.oid) ~* '(stripe|subscription|invoice|checkout)'
), 'ETH-026 specialist-assignment functions remain free of ETH-028 billing');
select is((select count(*) from public.appointments), 0::bigint, 'no ETH-027 appointment rows are created');

select * from finish();

rollback;
