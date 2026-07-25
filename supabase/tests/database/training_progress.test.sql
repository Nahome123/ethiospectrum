begin;

select plan(29);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'training-owner@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'training-other@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now());

select has_table('public', 'training_progress', 'training progress table exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.training_progress'::regclass), 'training progress RLS is enabled and forced');
select has_function('public', 'record_training_progress', array['text', 'boolean'], 'progress function has no browser-supplied user identifier');

set local role anon;
select throws_ok($$select * from public.training_progress$$, '42501', null, 'anonymous callers cannot read progress');
select throws_ok($$select * from public.record_training_progress('overview', false)$$, '42501', null, 'anonymous callers cannot record progress');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.record_training_progress('overview', false)$$, 'a signed-in user can record a viewed section');
select is((select count(*) from public.training_progress), 1::bigint, 'the first view creates one user-specific course row');
select is((select last_section from public.training_progress), 'overview', 'the last viewed section is stored');
select lives_ok($$select * from public.record_training_progress('overview', true)$$, 'a signed-in user can mark a section complete');
select is((select completed_sections from public.training_progress), array['overview']::text[], 'the completed section is stored');
select lives_ok($$select * from public.record_training_progress('overview', true)$$, 'marking an already-completed section is safe');
select is((select completed_sections from public.training_progress), array['overview']::text[], 'duplicate completed sections are normalized');
select lives_ok($$update public.training_progress set last_section = 'procedure'$$, 'a user can update their own progress row');
select is((select last_section from public.training_progress), 'procedure', 'own progress updates remain visible');

set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000002';
select is((select count(*) from public.training_progress), 0::bigint, 'another user cannot read progress');
select throws_ok(
  $$insert into public.training_progress (user_id, course_key, last_section) values ('81000000-0000-0000-0000-000000000001', 'rbt-errorless-teaching-intensive-teaching', 'overview')$$,
  '42501',
  null,
  'a browser caller cannot assign another user ID'
);
select lives_ok($$update public.training_progress set last_section = 'takeaways'$$, 'another user updates no inaccessible progress row');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select is((select last_section from public.training_progress), 'procedure', 'another user cannot change progress');
select throws_ok($$select * from public.record_training_progress('not-a-section', false)$$, '22023', 'Invalid training section.', 'invalid section keys are rejected by the controlled function');
select throws_ok(
  $$insert into public.training_progress (user_id, course_key, completed_sections) values ('81000000-0000-0000-0000-000000000001', 'rbt-errorless-teaching-intensive-teaching', array['not-a-section'])$$,
  '22023',
  'Invalid training section.',
  'invalid completed-section keys are rejected'
);
select throws_ok(
  $$insert into public.training_progress (user_id, course_key) values ('81000000-0000-0000-0000-000000000001', 'other-course')$$,
  '23514',
  null,
  'the course key is constrained'
);
select throws_ok(
  $$insert into public.training_progress (user_id, course_key) values ('81000000-0000-0000-0000-000000000001', 'rbt-errorless-teaching-intensive-teaching')$$,
  '23505',
  null,
  'duplicate user and course rows are prevented'
);
select lives_ok($$select * from public.record_training_progress('procedure', true)$$, 'procedure completion is recorded');
select lives_ok($$select * from public.record_training_progress('errors', true)$$, 'error-correction completion is recorded');
select lives_ok($$select * from public.record_training_progress('setup', true)$$, 'setup completion is recorded');
select lives_ok($$select * from public.record_training_progress('flashcards', true)$$, 'flashcard completion is recorded');
select lives_ok($$select * from public.record_training_progress('glossary', true)$$, 'glossary completion is recorded');
select lives_ok($$select * from public.record_training_progress('takeaways', true)$$, 'takeaway completion is recorded');
select ok((select completed_at is not null from public.training_progress), 'all seven content sections produce a content-completed timestamp');

select * from finish();
rollback;
