begin;

select plan(35);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'roadmap-owner@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'roadmap-admin@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'roadmap-member@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'roadmap-viewer@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'roadmap-removed@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'roadmap-outsider@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('72000000-0000-0000-0000-000000000001', 'Roadmap test household', '71000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001'),
  ('72000000-0000-0000-0000-000000000002', 'Other roadmap household', '71000000-0000-0000-0000-000000000006', '71000000-0000-0000-0000-000000000006');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'owner', 'active', now()),
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', 'administrator', 'active', now()),
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000003', 'member', 'active', now()),
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000004', 'viewer', 'active', now()),
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000005', 'member', 'removed', now()),
  ('72000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000006', 'owner', 'active', now());

set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000001';
insert into public.dependents (id, household_id, first_name)
values ('73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'Roadmap dependent');
reset role;

select has_table('public', 'roadmap_items', 'roadmap_items table exists');
select has_column('public', 'roadmap_items', 'household_id', 'roadmap item household column exists');
select has_column('public', 'roadmap_items', 'assigned_to', 'roadmap item assignment column exists');
select has_column('public', 'roadmap_items', 'archived_at', 'roadmap item archive column exists');
select has_table('public', 'reminders', 'ETH-022 reminder groundwork remains present');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.reminders'::regclass
    and contype = 'f'
    and confrelid = 'public.roadmap_items'::regclass
), 'reminders retain their roadmap-item foreign key');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.roadmap_items'::regclass), 'roadmap item RLS is enabled and forced');

set local role anon;
select throws_ok($$select * from public.roadmap_items$$, '42501', null, 'anonymous users cannot read roadmap items');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000001';
select lives_ok($$
  select * from public.create_roadmap_item(
    ' Owner action ', ' Owner description ', 'healthcare', 'high', 'not_started', '2026-07-01',
    '73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002',
    '74000000-0000-0000-0000-000000000001'
  )
$$, 'owner can create and assign an action item');
select is((select household_id from public.roadmap_items where title = 'Owner action'), '72000000-0000-0000-0000-000000000001'::uuid, 'household identity is derived server-side');
select is((select created_by from public.roadmap_items where title = 'Owner action'), '71000000-0000-0000-0000-000000000001'::uuid, 'creator identity is derived server-side');
select is((select assigned_to from public.roadmap_items where title = 'Owner action'), '71000000-0000-0000-0000-000000000002'::uuid, 'owner can assign an active household member');
select lives_ok($$
  select * from public.create_roadmap_item('Owner action', null, 'healthcare', 'high', 'not_started', null, null, null, '74000000-0000-0000-0000-000000000001')
$$, 'duplicate create key is safely idempotent');
select is((select count(*) from public.roadmap_items where created_by = '71000000-0000-0000-0000-000000000001'), 1::bigint, 'duplicate creation key creates one item');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000004';
select throws_ok($$
  select * from public.create_roadmap_item('Viewer action', null, 'general', 'medium', 'not_started', null, null, null, '74000000-0000-0000-0000-000000000002')
$$, '42501', null, 'viewer cannot create an action item');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000003';
select lives_ok($$
  select * from public.create_roadmap_item('Member action', null, 'general', 'medium', 'not_started', null, null, '71000000-0000-0000-0000-000000000003', '74000000-0000-0000-0000-000000000003')
$$, 'member can create an action item assigned to themselves');
select is((select assigned_to from public.roadmap_items where title = 'Member action'), '71000000-0000-0000-0000-000000000003'::uuid, 'member self-assignment is preserved');
select throws_ok($$
  select * from public.create_roadmap_item('Bad assignment', null, 'general', 'medium', 'not_started', null, null, '71000000-0000-0000-0000-000000000002', '74000000-0000-0000-0000-000000000004')
$$, '42501', null, 'member cannot assign another user');
select lives_ok($$
  select * from public.update_roadmap_item(
    (select id from public.roadmap_items where title = 'Member action'),
    (select updated_at from public.roadmap_items where title = 'Member action'),
    'Member action updated', null, 'general', 'medium', 'in_progress', null, null, '71000000-0000-0000-0000-000000000003'
  )
$$, 'member can edit an item assigned to themselves');
select throws_ok($$
  select * from public.update_roadmap_item(
    (select id from public.roadmap_items where title = 'Owner action'),
    (select updated_at from public.roadmap_items where title = 'Owner action'),
    'Forged owner action', null, 'healthcare', 'high', 'in_progress', null, null, null
  )
$$, '42501', null, 'member cannot edit an unrelated item');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000001';
select lives_ok($$
  select * from public.update_roadmap_item(
    (select id from public.roadmap_items where title = 'Owner action'),
    (select updated_at from public.roadmap_items where title = 'Owner action'),
    'Owner action', null, 'healthcare', 'high', 'completed', '2026-07-01', '73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002'
  )
$$, 'owner can complete an action item');
select ok((select completed_at is not null from public.roadmap_items where title = 'Owner action'), 'completion timestamp is controlled by the database');
select lives_ok($$
  select * from public.update_roadmap_item(
    (select id from public.roadmap_items where title = 'Owner action'),
    (select updated_at from public.roadmap_items where title = 'Owner action'),
    'Owner action', null, 'healthcare', 'high', 'in_progress', '2026-07-01', '73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002'
  )
$$, 'owner can reopen a completed action item');
select ok((select completed_at is null from public.roadmap_items where title = 'Owner action'), 'reopening clears the completion timestamp');
select lives_ok($$
  select * from public.update_roadmap_item(
    (select id from public.roadmap_items where title = 'Owner action'),
    (select updated_at from public.roadmap_items where title = 'Owner action'),
    'Owner action', null, 'healthcare', 'high', 'cancelled', null, null, null
  )
$$, 'owner can cancel an active action item');
select throws_ok($$
  select * from public.update_roadmap_item(
    (select id from public.roadmap_items where title = 'Owner action'),
    (select updated_at from public.roadmap_items where title = 'Owner action'),
    'Owner action', null, 'healthcare', 'high', 'blocked', null, null, null
  )
$$, '22023', null, 'invalid status transitions are rejected');
select lives_ok($$
  select * from public.archive_roadmap_item(
    (select id from public.roadmap_items where title = 'Owner action'),
    (select updated_at from public.roadmap_items where title = 'Owner action')
  )
$$, 'owner can archive an action item');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000003';
select throws_ok($$
  select * from public.archive_roadmap_item(
    (select id from public.roadmap_items where title = 'Member action updated'),
    (select updated_at from public.roadmap_items where title = 'Member action updated')
  )
$$, '42501', null, 'member cannot archive an action item');
select ok((select archived_at is null from public.roadmap_items where title = 'Member action updated'), 'member archive denial leaves their item unchanged');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000002';
select lives_ok($$
  select * from public.restore_roadmap_item(
    (select id from public.roadmap_items where title = 'Owner action'),
    (select updated_at from public.roadmap_items where title = 'Owner action')
  )
$$, 'administrator can restore an archived action item');
select throws_ok($$
  select * from public.update_roadmap_item(
    (select id from public.roadmap_items where title = 'Owner action'),
    '2000-01-01T00:00:00+00', 'Stale action', null, 'healthcare', 'high', 'blocked', null, null, null
  )
$$, '40001', null, 'stale edits are rejected');
reset role;
select is((select count(*) from public.reminders), 0::bigint, 'roadmap operations do not create or mutate reminders');
select ok(position('search_path' in pg_get_functiondef('public.create_roadmap_item(text,text,text,text,text,date,uuid,uuid,uuid)'::regprocedure)) > 0, 'create function fixes its search path');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000006';
select is((select count(*) from public.list_roadmap_items()), 0::bigint, 'unrelated household cannot list roadmap items');

reset role;
update public.household_members set status = 'removed' where user_id = '71000000-0000-0000-0000-000000000005';
set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000005';
select throws_ok($$select * from public.list_roadmap_items()$$, '42501', null, 'removed member loses roadmap access immediately');

select * from finish();
rollback;
