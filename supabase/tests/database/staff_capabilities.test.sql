begin;

select no_plan();

-- Synthetic accounts. a9..01 is an administrator who promotes the others.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'staff-admin@example.test', 'x', now(), '{}', '{"first_name": "Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'staff-yamrot@example.test', 'x', now(), '{}', '{"first_name": "Yamrot", "last_name": "Bekele"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'staff-milka@example.test', 'x', now(), '{}', '{"first_name": "Milka"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'staff-yoftahe@example.test', 'x', now(), '{}', '{"first_name": "Yoftahe"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'family-milka@example.test', 'x', now(), '{}', '{"first_name": "Milka", "account_intent": "household_owner"}', now(), now());
update public.user_roles set role = 'administrator' where user_id = 'a9000000-0000-4000-8000-000000000001';
-- Yamrot is an administrator too (administrators get a specialist profile automatically).
update public.user_roles set role = 'administrator' where user_id = 'a9000000-0000-4000-8000-000000000002';

create function pg_temp.capabilities(target_user uuid) returns text language sql stable as $$
  select coalesce(string_agg(capability.service_type || ':' || capability.language, ',' order by capability.service_type, capability.language), '')
  from public.specialist_capabilities as capability
  join public.specialists as specialist on specialist.id = capability.specialist_id
  where specialist.user_id = target_user;
$$;

select is(pg_temp.capabilities('a9000000-0000-4000-8000-000000000002'), 'consultation:am,consultation:en',
  'Yamrot (administrator) offers Consultation in English and Amharic');

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
select public.admin_set_user_role('a9000000-0000-4000-8000-000000000003', 'specialist');
select public.admin_set_user_role('a9000000-0000-4000-8000-000000000004', 'specialist');
reset role;

select is(pg_temp.capabilities('a9000000-0000-4000-8000-000000000003'), 'consultation:am,consultation:en,iep_language_assistance:am',
  'Milka offers Consultation and Amharic IEP assistance once promoted');
select is(pg_temp.capabilities('a9000000-0000-4000-8000-000000000004'), 'parent_support:am,parent_support:en',
  'Yoftahe offers Parent Support once promoted');
select is(pg_temp.capabilities('a9000000-0000-4000-8000-000000000005'), '', 'a family member with the same first name gets nothing');
select is((select specialties from public.specialists where user_id = 'a9000000-0000-4000-8000-000000000004'), array['parent_support']::text[],
  'the specialist summary reflects the capability');
select is(public.offered_self_scheduled_services(), array['consultation', 'parent_support']::text[],
  'both self-scheduled services are now offered');

-- Public times appear once Yoftahe has weekly hours.
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
select public.admin_update_specialist_schedule((select id from public.specialists where user_id = 'a9000000-0000-4000-8000-000000000004'), 'UTC',
  (select jsonb_agg(jsonb_build_object('weekday', d, 'start', '08:00', 'end', '20:00')) from generate_series(0, 6) as d));
reset role;
set local role anon;
set local request.jwt.claim.role = 'anon';
set local request.jwt.claim.sub = '';
select ok((select count(*) from public.list_public_parent_support_slots()) between 1 and 12, 'visitors see up to 12 upcoming free times');
select ok((select bool_and(end_at - start_at = interval '30 minutes') from public.list_public_parent_support_slots()), 'each is a 30-minute session');
select throws_ok($$select * from public.list_open_service_slots('consultation', 'en', null, 7)$$, '42501', null,
  'other open times still require signing in');

select * from finish();
rollback;
