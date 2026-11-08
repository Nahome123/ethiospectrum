begin;

select no_plan();

-- Synthetic accounts: c2..01 administrator, c2..02 parent support staff, c2..03 family,
-- c2..04 another family.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'apr-admin@example.test', 'x', now(), '{}', '{"first_name": "Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'apr-staff@example.test', 'x', now(), '{}', '{"first_name": "Selam"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'apr-family@example.test', 'x', now(), '{}', '{"first_name": "Hana", "account_intent": "household_owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'apr-other@example.test', 'x', now(), '{}', '{"first_name": "Abel", "account_intent": "household_owner"}', now(), now());
update public.user_roles set role = 'administrator' where user_id = 'c2000000-0000-4000-8000-000000000001';
-- Only this test's provider has a Calendly page.
update public.specialists set booking_page_url = null;
insert into public.dependents (household_id, first_name)
select id, 'Liya' from public.households where primary_owner_id = 'c2000000-0000-4000-8000-000000000003';

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000001';
select public.admin_set_user_role('c2000000-0000-4000-8000-000000000002', 'parent_support');

-- 1. The family sends a request ---------------------------------------------------------
set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000003';
select throws_ok($$select public.book_service_slot('parent_support', (select id from public.dependents where first_name = 'Liya'),
  '', 'en', null, now() + interval '1 day', 'UTC', gen_random_uuid())$$, '22023', null,
  'Parent Support can no longer be booked instantly');
insert into ids select 'request', public.request_parent_support(
  (select id from public.dependents where first_name = 'Liya'), 'Bedtime has been hard.', 'en', gen_random_uuid());
select is((select status || '/' || payment_status from public.service_requests where id = (select id from ids where name = 'request')),
  'pending_review/not_required', 'the request waits for approval and needs no payment');
select throws_ok($$select public.request_parent_support((select id from public.dependents where first_name = 'Liya'), 'Another question for you.', 'en', gen_random_uuid())$$,
  'ES429', null, 'one request waits for approval at a time');
select throws_ok($$select public.request_parent_support((select id from public.dependents where first_name = 'Liya'), 'Bedtime has been hard.', 'fr', gen_random_uuid())$$,
  '22023', null, 'the language must be English, Amharic or Spanish');
select is(public.get_parent_support_calendly_link((select id from ids where name = 'request')), null,
  'the family has no Calendly page before approval');
select throws_ok($$select public.admin_approve_parent_support((select id from ids where name = 'request'), 1)$$,
  '42501', null, 'families cannot approve');

reset role;
select is((select count(*) from public.notifications as notification
  join public.user_roles as role_row on role_row.user_id = notification.recipient_id and role_row.role = 'administrator'
  where notification.notification_type = 'admin_new_request'
    and notification.service_request_id = (select id from ids where name = 'request')) > 0, true,
  'administrators are told about the request');
set local role authenticated;

-- 2. The administrator approves ----------------------------------------------------------
set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000001';
select throws_ok($$select public.admin_approve_parent_support((select id from ids where name = 'request'),
  (select version from public.service_requests where id = (select id from ids where name = 'request')))$$,
  'ES428', null, 'approval needs a provider with a Calendly page');
set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000002';
select public.update_my_booking_page('https://calendly.com/selam/parent-support');
set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_approve_parent_support((select id from ids where name = 'request'),
  (select version from public.service_requests where id = (select id from ids where name = 'request')))$$,
  'the administrator approves the request');
select is((select status from public.service_requests where id = (select id from ids where name = 'request')),
  'assigned', 'the request is approved');
select is((select specialist.user_id from public.service_requests as request join public.specialists as specialist on specialist.id = request.specialist_id
  where request.id = (select id from ids where name = 'request')), 'c2000000-0000-4000-8000-000000000002'::uuid,
  'the Parent Support provider is assigned');

reset role;
select is((select count(*) from public.notifications
  where notification_type = 'parent_support_approved' and service_request_id = (select id from ids where name = 'request')
    and recipient_id = 'c2000000-0000-4000-8000-000000000003'), 1::bigint, 'the family is told it was approved');
set local role authenticated;

-- 3. Only the family (and administrators) get the Calendly page ---------------------------
set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000003';
select is(public.get_parent_support_calendly_link((select id from ids where name = 'request')),
  'https://calendly.com/selam/parent-support', 'the family now sees the Calendly page');
set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000004';
select is(public.get_parent_support_calendly_link((select id from ids where name = 'request')), null,
  'another family does not');

-- 4. Completing, and declining a free request ---------------------------------------------
set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_complete_parent_support((select id from ids where name = 'request'),
  (select version from public.service_requests where id = (select id from ids where name = 'request')))$$,
  'the administrator marks the session completed');
select is(public.get_parent_support_calendly_link((select id from ids where name = 'request')), null,
  'a completed request no longer shows the Calendly page');

set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000003';
insert into ids select 'second', public.request_parent_support(
  (select id from public.dependents where first_name = 'Liya'), 'Questions about school.', 'am', gen_random_uuid());
set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_decline_service_request((select id from ids where name = 'second'), 'Please call us instead.',
  (select version from public.service_requests where id = (select id from ids where name = 'second')))$$,
  'a free request can be declined');
select is((select status from public.service_requests where id = (select id from ids where name = 'second')),
  'declined', 'the request is declined');
select throws_ok($$select public.admin_approve_parent_support((select id from ids where name = 'second'),
  (select version from public.service_requests where id = (select id from ids where name = 'second')))$$,
  '55000', null, 'a declined request cannot be approved');

select * from finish();
rollback;
