begin;

select no_plan();

-- Synthetic users only.
--  a7..01 household owner     a7..02 administrator
--  a7..03 specialist "Yoftahe" (consultation + parent support)
--  a7..04 specialist "Milka" (consultation only)   a7..05 another owner
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a7000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'book-owner@example.test', 'x', now(), '{}', '{"first_name": "Selam", "account_intent": "household_owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a7000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'book-admin@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a7000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'book-yoftahe@example.test', 'x', now(), '{}', '{"first_name": "Yoftahe"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a7000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'book-milka@example.test', 'x', now(), '{}', '{"first_name": "Milka"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a7000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'book-other@example.test', 'x', now(), '{}', '{"first_name": "Other", "account_intent": "household_owner"}', now(), now());
update public.user_roles set role = 'administrator' where user_id = 'a7000000-0000-4000-8000-000000000002';

create temporary table ids (name text primary key, id uuid) on commit drop;
create temporary table slots (name text primary key, specialist_id uuid, start_at timestamptz) on commit drop;
grant all on ids, slots to authenticated, service_role;

-- 1. Administrator: specialists, capabilities and weekly hours -------------------

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000002';
select public.admin_set_user_role('a7000000-0000-4000-8000-000000000003', 'specialist');
select public.admin_set_user_role('a7000000-0000-4000-8000-000000000004', 'specialist');
insert into ids select 'yoftahe', specialist_id from public.admin_list_specialists() where user_id = 'a7000000-0000-4000-8000-000000000003';
insert into ids select 'milka', specialist_id from public.admin_list_specialists() where user_id = 'a7000000-0000-4000-8000-000000000004';
select public.admin_update_specialist((select id from ids where name = 'milka'), 'available',
  '[{"service_type": "consultation", "language": "en", "delivery_method": "remote"}]'::jsonb);
select public.admin_update_specialist((select id from ids where name = 'yoftahe'), 'available',
  '[{"service_type": "consultation", "language": "en", "delivery_method": "remote"}]'::jsonb);

-- Every day, 08:00-20:00 UTC, so there are always open times ahead.
select lives_ok($$select public.admin_update_specialist_schedule((select id from ids where name = 'milka'), 'UTC',
  (select jsonb_agg(jsonb_build_object('weekday', d, 'start', '08:00', 'end', '20:00')) from generate_series(0, 6) as d), 'https://meet.example.test/milka')$$,
  'an administrator sets weekly hours and a meeting link');
select public.admin_update_specialist_schedule((select id from ids where name = 'yoftahe'), 'UTC',
  (select jsonb_agg(jsonb_build_object('weekday', d, 'start', '08:00', 'end', '20:00')) from generate_series(0, 6) as d), 'https://meet.example.test/yoftahe');
select throws_ok($$select public.admin_update_specialist_schedule((select id from ids where name = 'milka'), 'Not/AZone', '[]'::jsonb)$$, '22023', null,
  'an unknown time zone is refused');
select throws_ok($$select public.admin_update_specialist_schedule((select id from ids where name = 'milka'), 'UTC', '[{"weekday": 1, "start": "17:00", "end": "09:00"}]'::jsonb)$$, '22023', null,
  'hours must end after they start');
select is((select jsonb_array_length(hours) from public.admin_list_specialist_schedules() where specialist_id = (select id from ids where name = 'milka')), 7,
  'the schedule can be read back');

select is(public.offered_self_scheduled_services(), array['consultation']::text[],
  'Parent Support is hidden while no specialist offers it');
select public.admin_update_specialist((select id from ids where name = 'yoftahe'), 'available',
  '[{"service_type": "consultation", "language": "en", "delivery_method": "remote"},
    {"service_type": "parent_support", "language": "en", "delivery_method": "remote"},
    {"service_type": "parent_support", "language": "am", "delivery_method": "remote"}]'::jsonb);
select is(public.offered_self_scheduled_services(), array['consultation', 'parent_support']::text[],
  'Parent Support appears once a specialist offers it');

-- 2. The family sees specialists and open times ------------------------------------

set local request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000001';
insert into public.dependents (household_id, first_name)
select id, 'Lulit' from public.households where primary_owner_id = 'a7000000-0000-4000-8000-000000000001';
insert into ids select 'dependent', id from public.dependents where first_name = 'Lulit';

select is((select count(*) from public.list_bookable_specialists('consultation')), 2::bigint, 'both consultation specialists are listed');
select is((select array_agg(display_name) from public.list_bookable_specialists('parent_support')), array['Yoftahe']::text[],
  'only the specialist with the capability offers Parent Support');
select ok((select count(distinct specialist_id) from public.list_open_service_slots('consultation', 'en', null, 7)) = 2,
  '"Either" combines both specialists'' open times');
select ok((select bool_and(start_at >= now() + interval '2 hours') from public.list_open_service_slots('consultation', 'en', null, 7)),
  'open times start at least two hours ahead');
select ok((select bool_and(end_at - start_at = interval '60 minutes') from public.list_open_service_slots('consultation', 'en', null, 7)),
  'consultation slots last an hour');
select ok((select bool_and(end_at - start_at = interval '30 minutes') from public.list_open_service_slots('parent_support', 'en', null, 7)),
  'Parent Support slots last 30 minutes');
select is((select count(*) from public.list_open_service_slots('iep_language_assistance', null, null, 7)), 0::bigint,
  'IEP is not self-scheduled');

insert into slots select 'milka1', specialist_id, start_at
from public.list_open_service_slots('consultation', 'en', (select id from ids where name = 'milka'), 7) limit 1;

-- 3. A paid consultation: hold, pay, confirm ----------------------------------------

insert into ids select 'consult', public.book_service_slot('consultation', (select id from ids where name = 'dependent'),
  'We need help with morning routines.', 'en', (select specialist_id from slots where name = 'milka1'),
  (select start_at from slots where name = 'milka1'), 'America/Chicago', 'c7000000-0000-4000-8000-000000000001',
  null, 'general_guidance', null);
select is((select status || '/' || payment_status from public.service_requests where id = (select id from ids where name = 'consult')),
  'awaiting_payment/unpaid', 'the booking waits for payment');
select is((select specialist_id from public.service_requests where id = (select id from ids where name = 'consult')),
  (select id from ids where name = 'milka'), 'the slot''s specialist is assigned');
select ok((select status = 'proposed' and hold_expires_at > now() and meeting_url = 'https://meet.example.test/milka'
  from public.service_appointments where service_request_id = (select id from ids where name = 'consult')),
  'the time is held during checkout, with the specialist''s meeting link');
select ok(not exists (select 1 from public.list_open_service_slots('consultation', 'en', (select id from ids where name = 'milka'), 7)
  where start_at = (select start_at from slots where name = 'milka1')), 'a held time is no longer offered');
select is(public.book_service_slot('consultation', (select id from ids where name = 'dependent'),
  'We need help with morning routines.', 'en', (select specialist_id from slots where name = 'milka1'),
  (select start_at from slots where name = 'milka1'), 'America/Chicago', 'c7000000-0000-4000-8000-000000000001',
  null, 'general_guidance', null), (select id from ids where name = 'consult'), 'booking is idempotent');

set local request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000005';
insert into public.dependents (household_id, first_name)
select id, 'Other child' from public.households where primary_owner_id = 'a7000000-0000-4000-8000-000000000005';
select throws_ok($$select public.book_service_slot('consultation', (select id from public.dependents where first_name = 'Other child'),
  'Another family wants the same time.', 'en', (select specialist_id from slots where name = 'milka1'),
  (select start_at from slots where name = 'milka1'), 'UTC', gen_random_uuid(), null, 'general_guidance', null)$$, 'ES409', null,
  'another family cannot take a held time');

set local request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000001';
insert into ids select 'payment1', payment_id from public.prepare_service_payment((select id from ids where name = 'consult'), null, false);
select is((select subtotal_cents from public.service_payments where id = (select id from ids where name = 'payment1')), 4999,
  'the consultation costs $49.99');

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select public.attach_service_payment_session((select id from ids where name = 'payment1'), 'cs_book_one');
select is(public.sync_service_payment((select id from ids where name = 'payment1'), 'cs_book_one', 'paid', now(), 'pi_book_one', 4999, 0), true,
  'the payment is recorded');
select is((select status || '/' || payment_status || '/' || appointment_status from public.service_requests where id = (select id from ids where name = 'consult')),
  'appointment_confirmed/paid/confirmed', 'payment confirms the booking');
select ok((select status = 'confirmed' and hold_expires_at is null and customer_confirmed
  from public.service_appointments where service_request_id = (select id from ids where name = 'consult')),
  'the held time becomes the confirmed appointment');
select ok(exists (select 1 from public.notifications where notification_type = 'appointment_confirmed'
  and recipient_id = 'a7000000-0000-4000-8000-000000000001'), 'the family is told the booking is confirmed');

-- 4. An abandoned checkout releases the time ------------------------------------------

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000001';
insert into slots select 'yoftahe1', specialist_id, start_at
from public.list_open_service_slots('consultation', 'en', (select id from ids where name = 'yoftahe'), 7) limit 1;
insert into ids select 'abandoned', public.book_service_slot('consultation', (select id from ids where name = 'dependent'),
  'A second question about school routines.', 'en', (select specialist_id from slots where name = 'yoftahe1'),
  (select start_at from slots where name = 'yoftahe1'), 'UTC', gen_random_uuid(), null, 'behavioral_educational', null);
insert into ids select 'payment2', payment_id from public.prepare_service_payment((select id from ids where name = 'abandoned'), null, false);
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select public.attach_service_payment_session((select id from ids where name = 'payment2'), 'cs_book_two');
select public.sync_service_payment((select id from ids where name = 'payment2'), 'cs_book_two', 'expired', now());
select is((select status from public.service_requests where id = (select id from ids where name = 'abandoned')), 'cancelled',
  'an expired checkout closes the booking');
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000001';
select ok(exists (select 1 from public.list_open_service_slots('consultation', 'en', (select id from ids where name = 'yoftahe'), 7)
  where start_at = (select start_at from slots where name = 'yoftahe1')), 'the released time is offered again');

-- 5. Parent Support: free, confirmed at once, one upcoming session -----------------------

insert into slots select 'ps1', specialist_id, start_at
from public.list_open_service_slots('parent_support', 'am', null, 7) offset 4 limit 1;
insert into ids select 'support', public.book_service_slot('parent_support', (select id from ids where name = 'dependent'),
  'I would like to talk about coping at home.', 'am', (select specialist_id from slots where name = 'ps1'),
  (select start_at from slots where name = 'ps1'), 'UTC', gen_random_uuid());
select is((select status || '/' || payment_status || '/' || appointment_status from public.service_requests where id = (select id from ids where name = 'support')),
  'appointment_confirmed/not_required/confirmed', 'Parent Support is confirmed immediately with no payment');
select throws_ok($$select * from public.prepare_service_payment((select id from ids where name = 'support'), null, false)$$, '55000', null,
  'there is nothing to pay');
select throws_ok($$select public.book_service_slot('parent_support', (select id from ids where name = 'dependent'),
  'Booking a second session right away.', 'am', (select id from ids where name = 'yoftahe'),
  (select start_at from public.list_open_service_slots('parent_support', 'am', null, 7) offset 6 limit 1), 'UTC', gen_random_uuid())$$, 'ES429', null,
  'one upcoming Parent Support session at a time');
select lives_ok($$select * from public.cancel_service_request((select id from ids where name = 'support'), 'Plans changed')$$,
  'a free session can be cancelled');
select lives_ok($$select public.book_service_slot('parent_support', (select id from ids where name = 'dependent'),
  'Booking again after cancelling.', 'am', (select id from ids where name = 'yoftahe'),
  (select start_at from public.list_open_service_slots('parent_support', 'am', null, 7) offset 6 limit 1), 'UTC', gen_random_uuid())$$,
  'after cancelling, a new session can be booked');

-- 6. Limits are configurable; only administrators change schedules ----------------------

select throws_ok($$select public.admin_set_service_booking_limit('parent_support', 2)$$, '42501', null,
  'families cannot change the limit');
select throws_ok($$select public.admin_update_specialist_schedule((select id from ids where name = 'milka'), 'UTC', '[]'::jsonb)$$, '42501', null,
  'families cannot change schedules');
set local request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000002';
select lives_ok($$select public.admin_set_service_booking_limit('parent_support', 2)$$, 'an administrator changes the limit');
select is((select max_upcoming_per_household from public.services where service_type = 'parent_support'), 2, 'the new limit is stored');

select * from finish();
rollback;
