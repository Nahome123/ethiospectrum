begin;

select no_plan();

-- Synthetic accounts: c3..01 administrator, c3..02 Yamrot (specialist), c3..03 Milka (specialist),
-- c3..04 family, c3..05 a specialist without Parent Support.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'cp-admin@example.test', 'x', now(), '{}', '{"first_name": "Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'cp-yamrot@example.test', 'x', now(), '{}', '{"first_name": "Yamrot", "last_name": "Bekele"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'cp-milka@example.test', 'x', now(), '{}', '{"first_name": "Milka", "last_name": "Abebe"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'cp-family@example.test', 'x', now(), '{}', '{"first_name": "Hana", "account_intent": "household_owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'cp-other@example.test', 'x', now(), '{}', '{"first_name": "Dawit"}', now(), now());
update public.user_roles set role = 'administrator' where user_id = 'c3000000-0000-4000-8000-000000000001';
update public.specialists set booking_page_url = null;
insert into public.dependents (household_id, first_name)
select id, 'Liya' from public.households where primary_owner_id = 'c3000000-0000-4000-8000-000000000004';

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000001';
select public.admin_set_user_role('c3000000-0000-4000-8000-000000000002', 'specialist');
select public.admin_set_user_role('c3000000-0000-4000-8000-000000000003', 'specialist');
select public.admin_set_user_role('c3000000-0000-4000-8000-000000000005', 'specialist');

reset role;
insert into ids select 'yamrot', id from public.specialists where user_id = 'c3000000-0000-4000-8000-000000000002';
insert into ids select 'milka', id from public.specialists where user_id = 'c3000000-0000-4000-8000-000000000003';
insert into ids select 'dawit', id from public.specialists where user_id = 'c3000000-0000-4000-8000-000000000005';
select is((select count(*)::int from public.specialist_capabilities
  where service_type = 'parent_support' and specialist_id in ((select id from ids where name = 'yamrot'), (select id from ids where name = 'milka'))),
  4, 'Yamrot and Milka offer Parent Support in English and Amharic when promoted');
select is((select count(*)::int from public.specialist_capabilities
  where service_type = 'parent_support' and specialist_id = (select id from ids where name = 'dawit')),
  0, 'other specialists are not given Parent Support');
set local role authenticated;

-- 1. Only providers with a Calendly page are listed ------------------------------------
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000004';
select is((select count(*)::int from public.list_parent_support_providers()), 0,
  'no one is listed before they add a Calendly page');
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000002';
select public.update_my_booking_page('https://calendly.com/yamrot/parent-support');
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000003';
select public.update_my_booking_page('https://calendly.com/milka/parent-support');
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000005';
select public.update_my_booking_page('https://calendly.com/dawit/meet');
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000004';
select is((select array_agg(first_name order by first_name) from public.list_parent_support_providers()),
  array['Milka', 'Yamrot'], 'families see the Parent Support providers who have a Calendly page');

-- 2. The family chooses Milka ----------------------------------------------------------
select throws_ok($$select public.request_parent_support((select id from public.dependents where first_name = 'Liya'),
  'Bedtime has been hard.', 'en', gen_random_uuid(), (select id from ids where name = 'dawit'))$$,
  '22023', null, 'only a listed provider can be chosen');
insert into ids select 'request', public.request_parent_support(
  (select id from public.dependents where first_name = 'Liya'), 'Bedtime has been hard.', 'en', gen_random_uuid(),
  (select id from ids where name = 'milka'));

reset role;
select is((select requested_specialist_id from public.service_requests where id = (select id from ids where name = 'request')),
  (select id from ids where name = 'milka'), 'the request remembers the choice');
set local role authenticated;

-- 3. Approval assigns the chosen provider ------------------------------------------------
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000001';
select is(public.admin_approve_parent_support((select id from ids where name = 'request'),
  (select version from public.service_requests where id = (select id from ids where name = 'request'))),
  (select id from ids where name = 'milka'), 'the administrator''s approval assigns Milka');
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000004';
select is(public.get_parent_support_calendly_link((select id from ids where name = 'request')),
  'https://calendly.com/milka/parent-support', 'the family gets Milka''s Calendly page');

-- 4. Without a choice, or if the chosen provider stopped taking bookings, someone else is assigned
reset role;
update public.service_requests set status = 'completed', completed_at = now() where id = (select id from ids where name = 'request');
update public.specialists set availability_status = 'unavailable' where id = (select id from ids where name = 'milka');
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000004';
insert into ids select 'second', public.request_parent_support(
  (select id from public.dependents where first_name = 'Liya'), 'Another bedtime question.', 'en', gen_random_uuid());
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000001';
select is(public.admin_approve_parent_support((select id from ids where name = 'second'),
  (select version from public.service_requests where id = (select id from ids where name = 'second'))),
  (select id from ids where name = 'yamrot'), 'without a choice the available provider is assigned');

-- 5. Signed-out visitors cannot list providers ------------------------------------------
reset role;
set local role anon;
select throws_ok($$select * from public.list_parent_support_providers()$$, '42501', null,
  'visitors cannot list providers');

select * from finish();
rollback;
