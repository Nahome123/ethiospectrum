begin;

select plan(32);

-- Synthetic users only. The Auth trigger provisions the profile rows.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'caregiver@example.test', 'not-a-real-password', now(), '{}', '{"first_name":"Caregiver"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'failed-onboarding@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'removed-member@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now());

select has_function(
  'public',
  'complete_household_onboarding',
  array['text', 'text', 'text', 'text', 'text', 'text'],
  'profile-aware onboarding function exists'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'household_members_one_active_membership_per_user_idx'
  ),
  'a partial unique index allows only one active household membership per user'
);
select ok(
  exists (
    select 1
    from pg_proc
    where oid = 'public.complete_household_onboarding(text, text, text, text, text, text)'::regprocedure
      and coalesce(array_to_string(proconfig, ','), '') like '%search_path=%'
  ),
  'onboarding security-definer function has a fixed search path'
);

set local role anon;
select throws_ok(
  $$select public.complete_household_onboarding('Anonymous household', '2026-07-15', 'Anonymous', null, 'en', 'UTC')$$,
  '42501',
  null,
  'unauthenticated onboarding is rejected'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
select isnt(
  public.complete_household_onboarding(
    '  የናሆም ቤተሰብ  ',
    '2026-07-15',
    '  ናሆም  ',
    '  ተሾመ  ',
    'am',
    'Africa/Addis_Ababa'
  )::text,
  null,
  'onboarding accepts multilingual names and returns the created household ID'
);
select is((select count(*) from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000001'), 1::bigint, 'onboarding creates exactly one household');
select is((select name from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000001'), 'የናሆም ቤተሰብ', 'the household name is stored trimmed');
select is((select count(*) from public.household_members where user_id = '20000000-0000-0000-0000-000000000001' and status = 'active'), 1::bigint, 'onboarding creates exactly one active membership');
select is((select household_id from public.household_members where user_id = '20000000-0000-0000-0000-000000000001' and status = 'active'), (select id from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000001'), 'active membership belongs to the authenticated user household');
select is((select permission::text from public.household_members where user_id = '20000000-0000-0000-0000-000000000001'), 'owner', 'onboarding assigns the owner role server-side');
select is((select status::text from public.household_members where user_id = '20000000-0000-0000-0000-000000000001'), 'active', 'the owner membership is active');
select is((select first_name from public.profiles where id = '20000000-0000-0000-0000-000000000001'), 'ናሆም', 'profile first name is updated in the onboarding transaction');
select is((select last_name from public.profiles where id = '20000000-0000-0000-0000-000000000001'), 'ተሾመ', 'profile last name is updated in the onboarding transaction');
select is((select preferred_locale from public.profiles where id = '20000000-0000-0000-0000-000000000001'), 'am', 'profile locale is updated in the onboarding transaction');
select is((select timezone from public.profiles where id = '20000000-0000-0000-0000-000000000001'), 'Africa/Addis_Ababa', 'profile timezone is updated in the onboarding transaction');
select is((select count(*) from public.consents where user_id = '20000000-0000-0000-0000-000000000001' and consent_type = 'household_onboarding' and policy_version = '2026-07-15'), 1::bigint, 'onboarding records the current consent exactly once');
select is(
  public.complete_household_onboarding('Second household', '2026-07-15', 'Nahom', '', 'am', 'Africa/Addis_Ababa'),
  (select id from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000001'),
  'repeat onboarding returns the existing household'
);
select is((select count(*) from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000001'), 1::bigint, 'repeat onboarding does not create a duplicate household');
select is((select last_name from public.profiles where id = '20000000-0000-0000-0000-000000000001'), null, 'an empty optional last name becomes null');
select is(
  public.create_household('Direct second household'),
  (select id from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000001'),
  'the legacy creation RPC cannot create a second active household'
);
select throws_ok(
  $$insert into public.household_members (household_id, user_id, permission, status) values ((select id from public.households limit 1), '20000000-0000-0000-0000-000000000002', 'owner', 'active')$$,
  '42501',
  null,
  'normal users cannot directly choose another user or owner role'
);
select throws_ok(
  $$select public.complete_household_onboarding('   ', '2026-07-15', 'Nahom', null, 'en', 'UTC')$$,
  '22023',
  null,
  'a whitespace-only household name is rejected'
);
select throws_ok(
  $$select public.complete_household_onboarding('Valid household', '2026-07-15', 'Nahom', null, 'fr', 'UTC')$$,
  '22023',
  null,
  'an unsupported locale is rejected'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
select throws_ok(
  $$select public.complete_household_onboarding('Failed household', '2026-07-15', 'New', null, 'en', 'not/a-timezone')$$,
  '22023',
  null,
  'an invalid timezone is rejected'
);
select is((select count(*) from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000002'), 0::bigint, 'a failed transaction leaves no household');
select is((select count(*) from public.household_members where user_id = '20000000-0000-0000-0000-000000000002'), 0::bigint, 'a failed transaction leaves no membership');
select is((select first_name from public.profiles where id = '20000000-0000-0000-0000-000000000002'), null, 'a failed transaction leaves no partial profile update');

reset role;
insert into public.household_members (household_id, user_id, permission, status, joined_at)
values ((select id from public.households where primary_owner_id = '20000000-0000-0000-0000-000000000001'), '20000000-0000-0000-0000-000000000003', 'member', 'active', now());
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000003';
select is((select count(*) from public.households), 1::bigint, 'an active member can read their household through RLS');
reset role;
update public.household_members set status = 'removed' where user_id = '20000000-0000-0000-0000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000003';
select is((select count(*) from public.households), 0::bigint, 'a removed member immediately loses household access');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles RLS remains enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.households'::regclass), 'households RLS remains enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.household_members'::regclass), 'household memberships RLS remains enabled and forced');

select * from finish();
rollback;
