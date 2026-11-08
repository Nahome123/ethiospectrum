begin;

select no_plan();

-- Synthetic accounts: b9..01 administrator, b9..02 parent support staff (any name),
-- b9..03 specialist, b9..04 family.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ps-admin@example.test', 'x', now(), '{}', '{"first_name": "Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ps-staff@example.test', 'x', now(), '{}', '{"first_name": "Selam"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'ps-specialist@example.test', 'x', now(), '{}', '{"first_name": "Dawit"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'ps-family@example.test', 'x', now(), '{}', '{"first_name": "Hana", "account_intent": "household_owner"}', now(), now());
update public.user_roles set role = 'administrator' where user_id = 'b9000000-0000-4000-8000-000000000001';

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

-- 1. The administrator grants the new role -------------------------------------------
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'b9000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_set_user_role('b9000000-0000-4000-8000-000000000002', 'parent_support')$$,
  'an administrator can make someone Parent Support staff');
select public.admin_set_user_role('b9000000-0000-4000-8000-000000000003', 'specialist');
insert into ids select 'staff', specialist_id from public.admin_list_specialists() where user_id = 'b9000000-0000-4000-8000-000000000002';
insert into ids select 'specialist', specialist_id from public.admin_list_specialists() where user_id = 'b9000000-0000-4000-8000-000000000003';
select isnt((select id from ids where name = 'staff'), null, 'Parent Support staff appear in Admin -> Specialists');
select is((select string_agg(service_type || ':' || language, ',' order by language) from public.specialist_capabilities
  where specialist_id = (select id from ids where name = 'staff')), 'parent_support:am,parent_support:en',
  'they start offering Parent Support in English and Amharic');
select throws_ok($$select public.admin_update_specialist((select id from ids where name = 'staff'), 'available',
  '[{"service_type": "consultation", "language": "en", "delivery_method": "remote"}]'::jsonb)$$, '22023', null,
  'they cannot be given other services');

-- 2. They set their own availability ---------------------------------------------------
set local request.jwt.claim.sub = 'b9000000-0000-4000-8000-000000000002';
select is((select is_parent_support from public.get_my_staff_schedule()), true, 'their schedule knows the role');
select lives_ok($$select public.update_my_staff_schedule('America/Chicago',
  '[{"weekday": 1, "start": "09:00", "end": "12:00"}, {"weekday": 3, "start": "13:00", "end": "17:00"}]'::jsonb,
  'https://meet.example.test/selam', true, array['am'])$$, 'they save their own hours, link and languages');
select is((select jsonb_array_length(hours) from public.get_my_staff_schedule()), 2, 'their hours are stored');
select is((select parent_support_languages from public.get_my_staff_schedule()), array['am']::text[], 'their languages are stored');
select is((select default_meeting_url from public.get_my_staff_schedule()), 'https://meet.example.test/selam', 'their meeting link is stored');
select throws_ok($$select public.update_my_staff_schedule('UTC', '[]'::jsonb, null, true, array[]::text[])$$, '22023', null,
  'at least one language is required');
select throws_ok($$select public.update_my_staff_schedule('UTC', '[{"weekday": 1, "start": "17:00", "end": "09:00"}]'::jsonb)$$, '22023', null,
  'hours must end after they start');
select lives_ok($$select public.update_my_staff_schedule('America/Chicago',
  '[{"weekday": 1, "start": "09:00", "end": "12:00"}]'::jsonb, null, false)$$, 'they can pause bookings');
select is((select accepting_bookings from public.get_my_staff_schedule()), false, 'bookings are paused');
select is(public.offered_self_scheduled_services() @> array['parent_support'], false, 'a paused Parent Support is not offered');
select public.update_my_staff_schedule('UTC', (select jsonb_agg(jsonb_build_object('weekday', d, 'start', '08:00', 'end', '20:00')) from generate_series(0, 6) as d),
  'https://meet.example.test/selam', true, array['en', 'am']);
select is(public.offered_self_scheduled_services() @> array['parent_support'], true, 'resuming makes it bookable again');

-- 3. Specialists manage their own hours too; families cannot -------------------------------
set local request.jwt.claim.sub = 'b9000000-0000-4000-8000-000000000003';
select lives_ok($$select public.update_my_staff_schedule('UTC', '[{"weekday": 2, "start": "10:00", "end": "14:00"}]'::jsonb)$$,
  'a specialist sets their own hours');
select is((select is_parent_support from public.get_my_staff_schedule()), false, 'a specialist is not Parent Support staff');
select lives_ok($$select public.update_my_staff_schedule('UTC', '[]'::jsonb, null, true, array['es'])$$,
  'a specialist''s language list is ignored');
select is((select count(*) from public.specialist_capabilities where specialist_id = (select id from ids where name = 'specialist') and service_type = 'parent_support'),
  0::bigint, 'a specialist does not get Parent Support by editing hours');
set local request.jwt.claim.sub = 'b9000000-0000-4000-8000-000000000004';
select throws_ok($$select public.update_my_staff_schedule('UTC', '[]'::jsonb)$$, '42501', null, 'families cannot set availability');
select is((select count(*) from public.get_my_staff_schedule()), 0::bigint, 'families have no staff schedule');

-- 4. An approved request reaches the Parent Support staff member ---------------------------
set local request.jwt.claim.sub = 'b9000000-0000-4000-8000-000000000002';
select public.update_my_booking_page('https://calendly.com/selam/parent-support');
set local request.jwt.claim.sub = 'b9000000-0000-4000-8000-000000000004';
insert into public.dependents (household_id, first_name)
select id, 'Liya' from public.households where primary_owner_id = 'b9000000-0000-4000-8000-000000000004';
insert into ids select 'booking', public.request_parent_support((select id from public.dependents where first_name = 'Liya'),
  'Talking through bedtime struggles.', 'en', gen_random_uuid());
set local request.jwt.claim.sub = 'b9000000-0000-4000-8000-000000000001';
select public.admin_approve_parent_support((select id from ids where name = 'booking'),
  (select version from public.service_requests where id = (select id from ids where name = 'booking')));
set local request.jwt.claim.sub = 'b9000000-0000-4000-8000-000000000002';
select is((select count(*) from public.get_service_request_detail((select id from ids where name = 'booking'))), 1::bigint,
  'the Parent Support staff member can open the session booked with them');
set local request.jwt.claim.sub = 'b9000000-0000-4000-8000-000000000003';
select is((select count(*) from public.get_service_request_detail((select id from ids where name = 'booking'))), 0::bigint,
  'other staff cannot');

reset role;
select is((select count(*) from pg_catalog.pg_proc as p join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and pg_catalog.pg_get_functiondef(p.oid) like '%''specialist''::public.app_role, ''administrator''::public.app_role)%'),
  0::bigint, 'every staff check includes the Parent Support role');

select * from finish();
rollback;
