begin;

select no_plan();

-- Synthetic users: c3..01 owner (auto-created household), c3..02 unrelated owner.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'schedule-owner@example.test', 'x', now(), '{}', '{"last_name": "Schedule", "account_intent": "household_owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'schedule-other@example.test', 'x', now(), '{}', '{"last_name": "Other", "account_intent": "household_owner"}', now(), now());

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

create function pg_temp.slot(hours integer) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'local_start', to_char((now() at time zone 'UTC') + make_interval(hours => hours), 'YYYY-MM-DD"T"HH24:MI'),
    'timezone', 'UTC');
$$;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000001';
insert into public.dependents (household_id, first_name)
select id, 'Lia' from public.households where primary_owner_id = 'c3000000-0000-4000-8000-000000000001';
insert into ids select 'request', public.create_service_request('consultation', (select id from public.dependents where first_name = 'Lia'),
  'We would like guidance on daily routines.', 'en', gen_random_uuid(), null, 'general_guidance', null, null, null, 'remote');

select lives_ok($$select public.set_requested_schedule((select id from ids where name = 'request'), 'direct', jsonb_build_array(pg_temp.slot(48)))$$,
  'the family can request one specific time');
select is((select scheduling_mode from public.service_request_requested_times where service_request_id = (select id from ids where name = 'request')), 'direct',
  'the direct choice is stored');
select ok((select (slots -> 0 ->> 'start_at') is not null from public.service_request_requested_times where service_request_id = (select id from ids where name = 'request')),
  'the requested time is resolved to an instant');

select lives_ok($$select public.set_requested_schedule((select id from ids where name = 'request'), 'propose', jsonb_build_array(pg_temp.slot(48), pg_temp.slot(72), pg_temp.slot(96)))$$,
  'the family can propose three options instead');
select is((select jsonb_array_length(slots) from public.service_request_requested_times where service_request_id = (select id from ids where name = 'request')), 3,
  'all proposed options are stored');

select throws_ok($$select public.set_requested_schedule((select id from ids where name = 'request'), 'propose', jsonb_build_array(pg_temp.slot(48)))$$, '22023', null,
  'proposing needs at least two options');
select throws_ok($$select public.set_requested_schedule((select id from ids where name = 'request'), 'direct', jsonb_build_array(pg_temp.slot(48), pg_temp.slot(72)))$$, '22023', null,
  'a direct request takes exactly one time');
select throws_ok($$select public.set_requested_schedule((select id from ids where name = 'request'), 'propose', jsonb_build_array(pg_temp.slot(48), pg_temp.slot(48)))$$, '22023', null,
  'proposed options must differ');
select throws_ok($$select public.set_requested_schedule((select id from ids where name = 'request'), 'direct', jsonb_build_array(pg_temp.slot(-2)))$$, '22023', null,
  'a past time is refused');
select throws_ok($$select public.set_requested_schedule((select id from ids where name = 'request'), 'direct', '[{"local_start": "2026-13-01T10:00", "timezone": "UTC"}]'::jsonb)$$, '22023', null,
  'a malformed time is refused');

set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000002';
select throws_ok($$select public.set_requested_schedule((select id from ids where name = 'request'), 'direct', jsonb_build_array(pg_temp.slot(48)))$$, '42501', null,
  'another household cannot set the times');
select is((select count(*) from public.service_request_requested_times where service_request_id = (select id from ids where name = 'request')), 0::bigint,
  'another household cannot read the requested times');

select * from finish();
rollback;
