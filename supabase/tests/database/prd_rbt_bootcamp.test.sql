begin;

select no_plan();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rbt-owner@example.test', 'x', now(), '{}', '{"last_name": "Learner", "account_intent": "household_owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rbt-caregiver@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rbt-admin@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'rbt-unsubscribed@example.test', 'x', now(), '{}', '{"account_intent": "household_owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'rbt-specialist@example.test', 'x', now(), '{}', '{}', now(), now());

update public.user_roles set role = 'administrator' where user_id = 'd1000000-0000-4000-8000-000000000003';
update public.user_roles set role = 'specialist' where user_id = 'd1000000-0000-4000-8000-000000000005';
insert into public.household_members (household_id, user_id, permission, status, joined_at, caregiver_permissions)
select id, 'd1000000-0000-4000-8000-000000000002', 'member', 'active', now(), array['submit_requests']
from public.households where primary_owner_id = 'd1000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
insert into public.dependents (household_id, first_name)
select id, 'Mahi' from public.households where primary_owner_id = 'd1000000-0000-4000-8000-000000000001';

select is((select count(*) from public.training_courses where slug = 'rbt-boot-camp' and status = 'published'), 1::bigint, 'the launch course shell is seeded');
select is((select resource_url from public.training_lessons limit 1), '/training/rbt', 'the reviewed study guide is a lesson resource');

-- No subscription: training content is locked.
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
select is((select has_access from public.get_training_access()), false, 'no subscription means no training access');
select is((select count(*) from public.training_lessons), 0::bigint, 'lessons are hidden without a subscription');
select is((select count(*) from public.get_training_outline('member', null)), 0::bigint, 'the outline is empty without a subscription');
select throws_ok($$select public.record_lesson_progress((select id from public.training_lessons limit 1), 'member', 50, false)$$, '42501', null,
  'progress cannot be recorded without a subscription');
select is((select can_subscribe from public.get_training_access()), true, 'the owner may subscribe');

-- Activate the subscription through the trusted synchronization path.
reset role;
insert into public.billing_customers (household_id, stripe_customer_id)
select id, 'cus_rbtLearner1' from public.households where primary_owner_id = 'd1000000-0000-4000-8000-000000000001';
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is(public.sync_billing_subscription((select id from public.households where primary_owner_id = 'd1000000-0000-4000-8000-000000000001'),
  'cus_rbtLearner1', 'sub_rbtLearner1', 'price_rbtMonthly1', 'month', 'active', now() - interval '1 day', now() + interval '29 days', false, now(), null),
  true, 'an active monthly subscription is synchronized');
reset role;
select is((select plan_key from public.billing_subscriptions), 'rbt_bootcamp', 'the plan is RBT Boot Camp');
select ok((select count(*) from public.notifications where notification_type = 'subscription_activated') >= 1, 'subscription purchase is notified');

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select is((select has_access from public.get_training_access()), true, 'the owner has training access');
select ok((select count(*) from public.get_training_outline('member', null)) >= 1, 'the outline lists published lessons');
select lives_ok($$select public.record_lesson_progress((select id from public.training_lessons limit 1), 'member', 40, false)$$, 'owner progress is recorded');
select lives_ok($$select public.record_lesson_progress((select id from public.training_lessons limit 1), 'member', 20, false)$$, 'lower progress does not regress');
select is((select progress_percentage from public.training_lesson_progress where learner_type = 'member'), 40, 'progress keeps the maximum');
select lives_ok($$select public.record_lesson_progress((select id from public.training_lessons limit 1), 'dependent', 0, true, (select id from public.dependents where first_name = 'Mahi'))$$,
  'dependent progress is recorded separately');
select is((select completed::text || '/' || progress_percentage from public.training_lesson_progress where learner_type = 'dependent'), 'true/100', 'completion sets 100%');
select is((select completed_lessons from public.get_training_progress_summary() where learner_type = 'dependent'), 1::bigint, 'the summary counts completed lessons per learner');
select throws_ok($$select public.record_lesson_progress((select id from public.training_lessons limit 1), 'dependent', 10, false, gen_random_uuid())$$, '22023', null,
  'a dependent outside the household is rejected');

-- Caregiver needs the access_training permission.
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000002';
select is((select has_access from public.get_training_access()), false, 'a caregiver without access_training is locked out');
reset role;
update public.household_members set caregiver_permissions = array['access_training'] where user_id = 'd1000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000002';
select is((select has_access from public.get_training_access()), true, 'an authorized caregiver has training access');
select is((select count(*) from public.training_lesson_progress), 2::bigint, 'the caregiver sees household progress');

-- Other households and specialists.
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000004';
select is((select count(*) from public.training_lesson_progress), 0::bigint, 'another household cannot read progress');
select is((select count(*) from public.training_courses), 0::bigint, 'another unsubscribed household cannot read courses');
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000005';
select is((select has_access from public.get_training_access()), false, 'specialists have no training access');

-- Administrators manage content; archiving keeps progress.
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select throws_ok($$select public.admin_save_training_course('x-course', 'X course', 'draft')$$, '42501', null, 'households cannot manage content');
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000003';
select lives_ok($$select public.admin_save_training_lesson((select id from public.training_modules order by sequence limit 1), 'What is neurodivergency?', 'published', 'Intro', null, '{"am": {"title": "ኒውሮዳይቨርጀንሲ ምንድን ነው?"}}'::jsonb, 'https://www.youtube.com/watch?v=example', null, null, 12)$$, 'admin adds a video lesson');
select throws_ok($$select public.admin_save_training_lesson((select id from public.training_modules order by sequence limit 1), 'Bad video', 'draft', null, null, null, 'http://insecure.example.test/video.mp4')$$, '23514', null, 'video links must use HTTPS');
select is(public.admin_attach_training_media((select id from public.training_lessons where title = 'What is neurodivergency?'), 'resource', 'Parent Worksheet.PDF'),
  'lessons/' || (select id from public.training_lessons where title = 'What is neurodivergency?')::text || '/resource/parent-worksheet.pdf', 'uploaded media paths are derived');
select throws_ok($$select public.admin_attach_training_media((select id from public.training_lessons limit 1), 'video', 'movie.exe')$$, '22023', null, 'unsupported media is rejected');
select lives_ok($$select public.admin_move_training_item('module', (select id from public.training_modules where title = 'Teaching procedures'), 'up')$$, 'admin reorders modules');
select is((select title from public.training_modules order by sequence limit 1), 'Teaching procedures', 'module order changed');
select lives_ok($$select public.admin_set_training_status('lesson', (select id from public.training_lessons where title like 'Errorless%'), 'archived')$$, 'admin archives a lesson');
select throws_ok($$delete from public.training_lessons$$, '42501', null, 'content cannot be deleted through the browser role');

set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select is((select count(*) from public.training_lesson_progress), 2::bigint, 'archiving content keeps learner progress');
select is((select count(*) from public.get_training_outline('member', null) where lesson_title like 'Errorless%'), 0::bigint, 'archived lessons leave the outline');
select is((select count(*) from public.training_lessons where title = 'What is neurodivergency?'), 1::bigint, 'new published lessons are visible to subscribers');

-- A lapsed subscription locks content again.
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is(public.sync_billing_subscription((select id from public.households where primary_owner_id = 'd1000000-0000-4000-8000-000000000001'),
  'cus_rbtLearner1', 'sub_rbtLearner1', 'price_rbtMonthly1', 'month', 'past_due', now() - interval '1 day', now() + interval '29 days', false, now() + interval '1 minute', null),
  true, 'a past-due subscription is synchronized');
reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select is((select has_access from public.get_training_access()), false, 'past-due subscriptions fail closed');
select is((select count(*) from public.training_lessons), 0::bigint, 'content is locked again');

select * from finish();
rollback;
