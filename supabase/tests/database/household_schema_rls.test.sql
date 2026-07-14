begin;

select plan(31);

-- Synthetic users only. The Auth trigger is part of the behavior under test.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@example.test', 'not-a-real-password', now(), '{}', '{"first_name":"Owner","preferred_locale":"am","role":"administrator"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member@example.test', 'not-a-real-password', now(), '{}', '{"first_name":"Member"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'other@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now());

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'user_roles', 'user_roles table exists');
select has_table('public', 'households', 'households table exists');
select has_table('public', 'household_members', 'household_members table exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.user_roles'::regclass), 'user_roles RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.households'::regclass), 'households RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.household_members'::regclass), 'household_members RLS is enabled and forced');
select ok(exists(select 1 from public.profiles where id = '10000000-0000-0000-0000-000000000001'), 'new Auth user creates a profile');
select is((select role::text from public.user_roles where user_id = '10000000-0000-0000-0000-000000000001'), 'member', 'new Auth user receives the member role');
select is((select role::text from public.user_roles where user_id = '10000000-0000-0000-0000-000000000001'), 'member', 'signup metadata cannot assign administrator');
select is((select preferred_locale from public.profiles where id = '10000000-0000-0000-0000-000000000001'), 'am', 'valid display metadata is retained');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select is((select count(*) from public.profiles), 1::bigint, 'a user reads only their own profile');
select lives_ok($$update public.profiles set first_name = 'Updated owner' where id = '10000000-0000-0000-0000-000000000001'$$, 'a user updates allowed profile fields');
select is((select first_name from public.profiles where id = '10000000-0000-0000-0000-000000000001'), 'Updated owner', 'profile update persists');
select is((select count(*) from public.user_roles), 1::bigint, 'a user reads only their own role');
select throws_ok($$update public.user_roles set role = 'administrator' where user_id = '10000000-0000-0000-0000-000000000001'$$, '42501', null, 'a user cannot change their application role');
select isnt(public.create_household('  Synthetic household  ')::text, null, 'create_household returns the created household ID');
select is((select count(*) from public.households where primary_owner_id = '10000000-0000-0000-0000-000000000001'), 1::bigint, 'create_household creates exactly one household');
select is((select permission::text from public.household_members where user_id = '10000000-0000-0000-0000-000000000001'), 'owner', 'create_household creates an owner membership');
select is((select status::text from public.household_members where user_id = '10000000-0000-0000-0000-000000000001'), 'active', 'owner membership is active');
select throws_ok($$insert into public.household_members (household_id, user_id, permission, status) values ((select id from public.households limit 1), '10000000-0000-0000-0000-000000000002', 'owner', 'active')$$, '42501', null, 'direct owner membership insertion is denied');
select throws_ok($$select public.create_household('')$$, '22023', null, 'invalid household names are rejected');

reset role;
insert into public.household_members (household_id, user_id, permission, status, joined_at)
select id, '10000000-0000-0000-0000-000000000002', 'member', 'active', now() from public.households where primary_owner_id = '10000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select is((select count(*) from public.households), 1::bigint, 'an active household member can read their household');
select is((select count(*) from public.household_members), 2::bigint, 'an active household member can read same-household memberships');
select throws_ok($$update public.households set primary_owner_id = '10000000-0000-0000-0000-000000000002' where true$$, '42501', null, 'ordinary members cannot change household ownership');

reset role;
update public.household_members set status = 'removed' where user_id = '10000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select is((select count(*) from public.households), 0::bigint, 'removed membership loses household access immediately');
select is((select count(*) from public.household_members), 0::bigint, 'removed membership loses membership access immediately');

reset role;
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anonymous users cannot read profiles');
select throws_ok($$select * from public.households$$, '42501', null, 'anonymous users cannot read households');
select throws_ok($$select public.create_household('Anonymous household')$$, '42501', null, 'unauthenticated household creation is rejected');

select * from finish();
rollback;
