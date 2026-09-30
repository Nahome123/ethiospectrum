begin;

select no_plan();

-- Synthetic users only. The first signs up as a household owner, so the
-- registration trigger must create the household automatically.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'prd-owner@example.test', 'x', now(), '{}',
    '{"first_name": "Selam", "last_name": "Tesfaye", "account_intent": "household_owner", "terms_policy_version": "2026-09-29"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'prd-caregiver@example.test', 'x', now(), '{}',
    '{"first_name": "Abel", "account_intent": "caregiver"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'prd-second-caregiver@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'prd-other-owner@example.test', 'x', now(), '{}',
    '{"last_name": "Other", "account_intent": "household_owner"}', now(), now());

select is((select count(*) from public.households where primary_owner_id = 'a1000000-0000-4000-8000-000000000001'), 1::bigint,
  'registering as a household owner creates exactly one household');
select is((select name from public.households where primary_owner_id = 'a1000000-0000-4000-8000-000000000001'), 'Tesfaye household',
  'the household name is derived from the owner last name');
select is((select permission::text from public.household_members where user_id = 'a1000000-0000-4000-8000-000000000001'), 'owner',
  'the registering user is the active owner');
select is((select count(*) from public.household_members where user_id = 'a1000000-0000-4000-8000-000000000002'), 0::bigint,
  'a caregiver registration creates no household');
select is((select count(*) from public.consents where user_id = 'a1000000-0000-4000-8000-000000000001'), 1::bigint,
  'the accepted terms version is recorded as consent');
select is((select count(*) from public.notifications where recipient_id = 'a1000000-0000-4000-8000-000000000001' and notification_type = 'account_created'), 1::bigint,
  'account creation queues a notification');

-- Owner invites the caregiver.
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

select is((select is_owner from public.get_current_household_access()), true, 'owner access projection');
select is((select cardinality(caregiver_permissions) from public.get_current_household_access()), 6, 'the owner holds every household permission');
select throws_ok($$select * from public.create_caregiver_invitation('not-an-email', array['submit_requests'])$$, '22023', null, 'invalid invitation email is rejected');
select throws_ok($$select * from public.create_caregiver_invitation('someone@example.test', array['delete_everything'])$$, '22023', null, 'unknown caregiver permissions are rejected');
select throws_ok($$select * from public.create_caregiver_invitation('prd-owner@example.test', array['submit_requests'])$$, '22023', null, 'the owner cannot invite themselves');

create temporary table invitation_token (token text) on commit drop;
grant all on invitation_token to authenticated;
insert into invitation_token
  select invitation_token from public.create_caregiver_invitation('PRD-Caregiver@Example.test', array['submit_requests', 'access_training', 'confirm_appointments']);
select is((select char_length(token) from invitation_token), 64, 'a 64-character bearer token is returned once');
select is((select email from public.household_invitations), 'prd-caregiver@example.test', 'invitation email is normalized');
select throws_ok($$select * from public.create_caregiver_invitation('other@example.test', array['submit_requests'])$$, '54000', null, 'only one pending invitation per household');

reset role;
select is((select count(*) from public.household_invitations where token_hash = encode(sha256(convert_to((select token from invitation_token), 'UTF8')), 'hex')), 1::bigint,
  'only the token hash is stored on the invitation');
select is((select count(*) from public.notifications where notification_type = 'caregiver_invitation' and recipient_email = 'prd-caregiver@example.test'), 1::bigint,
  'an invitation email is queued for the invitee');

-- A different signed-in user cannot accept with the token.
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000003';
select is((select status from public.get_caregiver_invitation((select token from invitation_token))), 'pending', 'the invitation preview is available with the token');
select throws_ok($$select public.accept_caregiver_invitation((select token from invitation_token))$$, '42501', null, 'a different email cannot accept the invitation');
select throws_ok($$select public.accept_caregiver_invitation('wrong-token')$$, '55000', null, 'an unknown token is rejected');

-- The invited caregiver accepts.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';
select lives_ok($$select public.accept_caregiver_invitation((select token from invitation_token))$$, 'the invited caregiver accepts');
select is((select permission::text from public.get_current_household_access()), 'member', 'the caregiver joins as the household member');
select is((select caregiver_permissions from public.get_current_household_access()),
  array['access_training', 'confirm_appointments', 'submit_requests']::text[], 'granted caregiver permissions are stored');
select is((select count(*) from public.list_household_people()), 2::bigint, 'the household has an owner and one caregiver');
select throws_ok($$select public.accept_caregiver_invitation((select token from invitation_token))$$, '55000', null, 'an accepted invitation cannot be reused');
select throws_ok($$select * from public.create_caregiver_invitation('x@example.test', array['submit_requests'])$$, '42501', null, 'a caregiver cannot invite');
select is((select count(*) from public.household_invitations), 0::bigint, 'the caregiver cannot read invitations');
select lives_ok($$insert into public.dependents (household_id, first_name, service_needs, preferred_language)
  values ((select household_id from public.get_current_household_access()), 'Liya', 'Speech support', 'am')$$,
  'the caregiver can add a dependent with service information');
select throws_ok($$insert into public.dependents (household_id, first_name, preferred_language)
  values ((select household_id from public.get_current_household_access()), 'Bad', 'fr')$$,
  '23514', null, 'dependent preferred language is constrained');

-- A second caregiver cannot be added.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.create_caregiver_invitation('prd-second-caregiver@example.test', array['submit_requests'])$$, '54000', null,
  'a household may have only one caregiver');
select lives_ok($$select public.update_caregiver_permissions(
  (select member_id from public.list_household_people() where permission = 'member'), array['make_payments'])$$, 'the owner can change caregiver permissions');
select is((select caregiver_permissions from public.household_members where user_id = 'a1000000-0000-4000-8000-000000000002'),
  array['make_payments']::text[], 'the updated permissions are visible to the owner');
select is((select count(*) from public.notifications where notification_type = 'caregiver_joined'), 1::bigint, 'the owner is notified when the caregiver joins');

-- Caregiver permissions are enforced by the shared authorization primitive.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';
select is(private.household_actor_can((select household_id from public.get_current_household_access()), 'make_payments'), true, 'granted permission is honored');
select is(private.household_actor_can((select household_id from public.get_current_household_access()), 'submit_requests'), false, 'revoked permission is denied');

-- The other household is isolated.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000004';
select is((select count(*) from public.dependents where first_name = 'Liya'), 0::bigint, 'another household cannot read dependents');
select is((select count(*) from public.list_household_people()), 1::bigint, 'another household sees only its own people');
select throws_ok($$select public.remove_caregiver((select id from public.household_members where user_id = 'a1000000-0000-4000-8000-000000000002'))$$,
  '42501', null, 'another owner cannot remove the caregiver');

-- Notifications are private and can be marked read.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select ok((select unread_count from public.get_notification_summary()) >= 2, 'the owner has unread notifications');
select is((select count(*) from public.notifications where recipient_id <> 'a1000000-0000-4000-8000-000000000001'), 0::bigint, 'only own notifications are visible');
select ok(public.mark_notifications_read(null) >= 2, 'all notifications can be marked read');
select is((select unread_count from public.get_notification_summary()), 0::bigint, 'no unread notifications remain');
select throws_ok($$select * from public.claim_notification_emails(10)$$, '42501', null, 'browsers cannot claim notification emails');

-- The owner removes the caregiver; access ends immediately.
select lives_ok($$select public.remove_caregiver((select member_id from public.list_household_people() where permission = 'member'))$$, 'the owner removes the caregiver');
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';
select is((select count(*) from public.get_current_household_access()), 0::bigint, 'a removed caregiver loses household access');
select is((select count(*) from public.dependents), 0::bigint, 'a removed caregiver loses dependent access');

-- The email worker claims and completes deliveries.
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select ok((select count(*) from public.claim_notification_emails(50)) >= 3, 'the service role claims pending emails');
select is((select recipient_email from public.claim_notification_emails(50) limit 1), null, 'claimed rows are leased and not claimed twice');
reset role;
set local role service_role;
select lives_ok($$select public.complete_notification_email((select id from public.notifications where notification_type = 'caregiver_invitation'), 'sent')$$,
  'the worker completes a delivery');
reset role;
select is((select payload ? 'token' from public.notifications where notification_type = 'caregiver_invitation'), false,
  'the invitation token is removed after delivery');
select is((select email_status from public.notifications where notification_type = 'caregiver_invitation'), 'sent', 'delivery status is recorded');

select * from finish();
rollback;
