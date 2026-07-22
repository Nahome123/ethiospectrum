begin;

select plan(16);

-- Synthetic users only. The Auth trigger provisions the profile the consent row references.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'caregiver@example.test', 'not-a-real-password', now(), '{}', '{"first_name":"Caregiver"}', now(), now());

select has_function('public', 'complete_household_onboarding', array['text', 'text'], 'complete_household_onboarding function exists');

set local role anon;
select throws_ok($$select public.complete_household_onboarding('Anonymous household', '2026-07-15')$$, '42501', null, 'unauthenticated onboarding is rejected');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
select isnt(public.complete_household_onboarding('  Onboarding household  ', '2026-07-15')::text, null, 'onboarding returns the created household ID');
select is((select count(*) from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000001'), 1::bigint, 'onboarding creates exactly one household');
select is((select name from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000001'), 'Onboarding household', 'the household name is stored trimmed');
select is((select permission::text from public.household_members where user_id = '20000000-0000-0000-0000-000000000001'), 'owner', 'onboarding creates an owner membership');
select is((select status::text from public.household_members where user_id = '20000000-0000-0000-0000-000000000001'), 'active', 'the owner membership is active');
select is((select count(*) from public.consents where user_id = '20000000-0000-0000-0000-000000000001' and consent_type = 'household_onboarding' and policy_version = '2026-07-15'), 1::bigint, 'onboarding records the consent with its policy version');
select is(public.complete_household_onboarding('Second household', '2026-07-15'), (select id from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000001'), 'repeat onboarding returns the existing household');
select is((select count(*) from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000001'), 1::bigint, 'repeat onboarding does not create a duplicate household');
select is((select count(*) from public.consents where user_id = '20000000-0000-0000-0000-000000000001' and policy_version = '2026-07-15'), 1::bigint, 'an already-accepted policy version is not duplicated');
select isnt(public.complete_household_onboarding('Second household', '2026-08-01')::text, null, 'a newer policy version can be accepted after onboarding');
select is((select count(*) from public.consents where user_id = '20000000-0000-0000-0000-000000000001' and consent_type = 'household_onboarding'), 2::bigint, 'accepting a newer policy version records a second consent row');
select throws_ok($$select public.complete_household_onboarding('', '2026-07-15')$$, '22023', null, 'an empty household name is rejected');
select throws_ok($$select public.complete_household_onboarding('   ', '2026-07-15')$$, '22023', null, 'a whitespace-only household name is rejected');
select throws_ok($$select public.complete_household_onboarding('Onboarding household', '  ')$$, '22023', null, 'a blank consent policy version is rejected');

select * from finish();
rollback;
