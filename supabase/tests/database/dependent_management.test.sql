begin;

select plan(20);

-- Synthetic users only. Auth synchronization creates the profiles their households reference.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dependent-owner@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'dependent-admin@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'dependent-member@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dependent-viewer@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'dependent-outsider@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('40000000-0000-0000-0000-000000000001', 'Dependent test household', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', 'Other dependent household', '30000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000005');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'owner', 'active', now()),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'administrator', 'active', now()),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'member', 'active', now()),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 'viewer', 'active', now()),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000005', 'owner', 'active', now());

select has_table('public', 'dependents', 'dependents table exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.dependents'::regclass), 'dependents RLS is enabled and forced');

set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000001';
select lives_ok($$insert into public.dependents (household_id, first_name, preferred_name) values ('40000000-0000-0000-0000-000000000001', ' Child ', ' First ')$$, 'owner can create a dependent');
select is((select first_name from public.dependents limit 1), 'Child', 'dependent names are trimmed');
select is((select created_by from public.dependents limit 1), '30000000-0000-0000-0000-000000000001'::uuid, 'the creator is derived from the authenticated owner');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000002';
select lives_ok($$insert into public.dependents (household_id, first_name) values ('40000000-0000-0000-0000-000000000001', 'Administrator child')$$, 'administrator can create a dependent');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
select is((select count(*) from public.dependents), 2::bigint, 'ordinary member can read active dependents');
select throws_ok($$insert into public.dependents (household_id, first_name) values ('40000000-0000-0000-0000-000000000001', 'Denied member')$$, '42501', null, 'ordinary member cannot create a dependent');
select lives_ok($$update public.dependents set first_name = 'Denied update' where first_name = 'Child'$$, 'ordinary member update is filtered by RLS');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000001';
select is((select first_name from public.dependents where preferred_name = 'First'), 'Child', 'ordinary member cannot update a dependent');
select throws_ok($$update public.dependents set household_id = '40000000-0000-0000-0000-000000000002' where preferred_name = 'First'$$, '42501', null, 'household reassignment is denied');
select lives_ok($$update public.dependents set first_name = 'Updated child' where preferred_name = 'First'$$, 'owner can update a dependent');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000004';
select is((select count(*) from public.dependents), 2::bigint, 'viewer can read active dependents');
select throws_ok($$insert into public.dependents (household_id, first_name) values ('40000000-0000-0000-0000-000000000001', 'Denied viewer')$$, '42501', null, 'viewer cannot create a dependent');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000005';
select is((select count(*) from public.dependents where household_id = '40000000-0000-0000-0000-000000000001'), 0::bigint, 'an unrelated household cannot read dependents');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000001';
select lives_ok($$update public.dependents set archived_at = now() where preferred_name = 'First'$$, 'owner can archive a dependent');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
select is((select count(*) from public.dependents), 1::bigint, 'archived dependents are excluded from ordinary member reads');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000002';
select lives_ok($$update public.dependents set archived_at = now() where first_name = 'Administrator child'$$, 'administrator can archive a dependent');

reset role;
update public.household_members set status = 'removed' where household_id = '40000000-0000-0000-0000-000000000001' and user_id = '30000000-0000-0000-0000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
select is((select count(*) from public.dependents), 0::bigint, 'removed membership loses dependent access immediately');

reset role;
set local role anon;
select throws_ok($$select * from public.dependents$$, '42501', null, 'anonymous users cannot read dependents');

select * from finish();
rollback;
