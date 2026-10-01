begin;

select no_plan();

-- Synthetic users only.
--  c1..01 administrator   c1..02 household owner (auto-created household)
--  c1..03 plain member    c1..04 owner later promoted to administrator
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'roles-admin@example.test', 'x', now(), '{}', '{"first_name": "Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'roles-owner@example.test', 'x', now(), '{}', '{"last_name": "Owner", "account_intent": "household_owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'roles-member@example.test', 'x', now(), '{}', '{"first_name": "Plain"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'roles-promoted@example.test', 'x', now(), '{}', '{"last_name": "Promoted", "account_intent": "household_owner"}', now(), now());
update public.user_roles set role = 'administrator' where user_id = 'c1000000-0000-4000-8000-000000000001';
insert into auth.sessions (user_id) values
  ('c1000000-0000-4000-8000-000000000003'),
  ('c1000000-0000-4000-8000-000000000003'),
  ('c1000000-0000-4000-8000-000000000004');
update public.user_roles set granted_at = now() - interval '1 day'
where user_id in ('c1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000004');

-- Content editor removal ----------------------------------------------------

select is(enum_range(null::public.app_role)::text, '{member,specialist,administrator}', 'content_editor is no longer a role');

-- Role changes require a fresh sign-in -------------------------------------

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_set_user_role('c1000000-0000-4000-8000-000000000003', 'specialist')$$, 'an administrator promotes a member to specialist');
reset role;
select is((select role::text from public.user_roles where user_id = 'c1000000-0000-4000-8000-000000000003'), 'specialist', 'the role is stored');
select is((select count(*) from auth.sessions where user_id = 'c1000000-0000-4000-8000-000000000003'), 0::bigint, 'every session of the promoted user is revoked');
select ok((select granted_at > now() - interval '1 minute' from public.user_roles where user_id = 'c1000000-0000-4000-8000-000000000003'), 'the role change time is recorded');
select ok(exists (select 1 from public.specialists where user_id = 'c1000000-0000-4000-8000-000000000003'), 'a specialist profile is created');
select is((select metadata ->> 'previous_role' from public.audit_logs where action = 'user_role_changed' and entity_id = 'c1000000-0000-4000-8000-000000000003'), 'member', 'the audit log records the previous role');

update public.user_roles set granted_at = now() - interval '1 day' where user_id = 'c1000000-0000-4000-8000-000000000003';
insert into auth.sessions (user_id) values ('c1000000-0000-4000-8000-000000000003');
set local role authenticated;
select lives_ok($$select public.admin_set_user_role('c1000000-0000-4000-8000-000000000003', 'specialist')$$, 'reapplying the same role is accepted');
reset role;
select ok((select granted_at < now() - interval '1 hour' from public.user_roles where user_id = 'c1000000-0000-4000-8000-000000000003'), 'an unchanged role does not force a new sign-in');
select is((select count(*) from auth.sessions where user_id = 'c1000000-0000-4000-8000-000000000003'), 1::bigint, 'an unchanged role keeps sessions');

-- Administrators hold the specialist role ----------------------------------

select ok(exists (select 1 from public.specialists where user_id = 'c1000000-0000-4000-8000-000000000001'), 'existing administrators have a specialist profile');
set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select ok(exists (select 1 from public.admin_list_specialists() where user_id = 'c1000000-0000-4000-8000-000000000001'), 'administrators are listed as specialists');
select isnt(private.current_specialist_profile_id(), null, 'an administrator acts with their specialist profile');

-- Administrators cannot use household features -----------------------------

select throws_ok($$select public.create_household('Admin household')$$, '42501', null, 'an administrator cannot create a household');
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000004';
select ok(private.household_actor_can((select id from public.households where primary_owner_id = 'c1000000-0000-4000-8000-000000000004'), 'submit_requests'),
  'an owner can act for their household');
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_set_user_role('c1000000-0000-4000-8000-000000000004', 'administrator')$$, 'an owner is promoted to administrator');
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000004';
select ok(not private.household_actor_can((select id from public.households where primary_owner_id = 'c1000000-0000-4000-8000-000000000004'), 'submit_requests'),
  'a promoted administrator can no longer act for the household');
select ok(not private.has_household_permission((select id from public.households where primary_owner_id = 'c1000000-0000-4000-8000-000000000004'), array['owner']::public.household_permission[]),
  'legacy household permissions also refuse administrators');
reset role;
select throws_ok($$insert into public.household_members (household_id, user_id, permission, status, joined_at)
  select id, 'c1000000-0000-4000-8000-000000000001', 'member', 'active', now() from public.households where primary_owner_id = 'c1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'an administrator cannot be added to a household');

select * from finish();
rollback;
