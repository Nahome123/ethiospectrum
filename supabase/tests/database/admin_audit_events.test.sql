begin;

select no_plan();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c4000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'audit-admin@example.test', 'x', now(), '{}', '{"first_name": "Admin"}', now(), now());

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select isnt(
  public.record_admin_audit_event('c4000000-0000-4000-8000-000000000001', 'user_deleted', 'user', gen_random_uuid(), null, '{"reason": "requested"}'::jsonb),
  null, 'the server records an audit event');
select is(
  (select actor_id from public.audit_logs where action = 'user_deleted' order by created_at desc limit 1),
  'c4000000-0000-4000-8000-000000000001'::uuid, 'the acting administrator is recorded');
select lives_ok(
  $$select public.record_admin_audit_event(gen_random_uuid(), 'user_deleted', 'user', gen_random_uuid(), gen_random_uuid(), '{}'::jsonb)$$,
  'an actor or household without a record is stored as empty instead of failing');
select throws_ok(
  $$select public.record_admin_audit_event(null, 'Bad Action!', 'user')$$, '22023', null, 'malformed actions are refused');

reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c4000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.record_admin_audit_event(null, 'user_deleted', 'user')$$, '42501', null, 'signed-in users cannot write audit events');

select * from finish();
rollback;
