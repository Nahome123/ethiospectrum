begin;

select no_plan();

-- Synthetic accounts: c1..01 administrator, c1..02 parent support staff, c1..03 family.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'cal-admin@example.test', 'x', now(), '{}', '{"first_name": "Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'cal-staff@example.test', 'x', now(), '{}', '{"first_name": "Selam"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'cal-family@example.test', 'x', now(), '{}', '{"first_name": "Hana", "account_intent": "household_owner"}', now(), now());
update public.user_roles set role = 'administrator' where user_id = 'c1000000-0000-4000-8000-000000000001';
-- Start from no Calendly links so the public lookup only sees this test's staff.
update public.specialists set booking_page_url = null;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select public.admin_set_user_role('c1000000-0000-4000-8000-000000000002', 'parent_support');

-- Parent Support staff set their own Calendly link ------------------------------------
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000002';
select is(public.get_my_booking_page(), null, 'no Calendly link to begin with');
select throws_ok($$select public.update_my_booking_page('https://evil.example.test/book')$$, '22023', null,
  'only calendly.com links are accepted');
select throws_ok($$select public.update_my_booking_page('http://calendly.com/selam')$$, '22023', null,
  'the link must use https');
select lives_ok($$select public.update_my_booking_page('  https://calendly.com/selam/parent-support  ')$$,
  'they save their Calendly link');
select is(public.get_my_booking_page(), 'https://calendly.com/selam/parent-support', 'the link is stored, trimmed');

-- The page is no longer handed out publicly; families get it once approved ------------
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000003';
select throws_ok($$select public.update_my_booking_page('https://calendly.com/hana')$$, '42501', null,
  'families cannot set a booking page');
select throws_ok($$select public.get_parent_support_booking_page()$$, '42501', null,
  'families cannot look up the Calendly page directly');
reset role;
set local role anon;
select throws_ok($$select public.get_parent_support_booking_page()$$, '42501', null,
  'nor can visitors');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000002';
select lives_ok($$select public.update_my_booking_page('')$$, 'clearing the link');
select is(public.get_my_booking_page(), null, 'the link is cleared');

select * from finish();
rollback;
