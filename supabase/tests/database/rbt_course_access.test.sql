begin;

select no_plan();

-- Synthetic users: a8..01 course buyer, a8..02 grandfathered subscriber, a8..03 another owner.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'course-buyer@example.test', 'x', now(), '{}', '{"first_name": "Abeba", "account_intent": "household_owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'course-legacy@example.test', 'x', now(), '{}', '{"first_name": "Legacy", "account_intent": "household_owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'course-other@example.test', 'x', now(), '{}', '{"first_name": "Other", "account_intent": "household_owner"}', now(), now());

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;
insert into ids select 'buyer', id from public.households where primary_owner_id = 'a8000000-0000-4000-8000-000000000001';
insert into ids select 'legacy', id from public.households where primary_owner_id = 'a8000000-0000-4000-8000-000000000002';
insert into ids select 'other', id from public.households where primary_owner_id = 'a8000000-0000-4000-8000-000000000003';

-- A grandfathered monthly subscription (written directly, as the webhook would).
insert into public.billing_customers (household_id, stripe_customer_id) values ((select id from ids where name = 'legacy'), 'cus_legacy1');
insert into public.billing_subscriptions (household_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_key, billing_interval, stripe_status, entitlement_status, current_period_start, current_period_end, cancel_at_period_end, provider_updated_at)
values ((select id from ids where name = 'legacy'), 'cus_legacy1', 'sub_legacy1', 'price_legacy1', 'rbt_bootcamp', 'month', 'active', 'active', now() - interval '10 days', now() + interval '20 days', false, now());

select is((select payment_type from public.services where service_type = 'rbt_bootcamp'), 'one_time', 'RBT Boot Camp is a one-time purchase');

-- 1. Before buying -------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000001';
select is((select has_access from public.get_training_access()), false, 'no access before buying');
select is((select access_expires_at from public.get_training_course_status()), null, 'no access date yet');
select is((select can_purchase and renewable from public.get_training_course_status()), true, 'the owner can buy the course');
select throws_ok($$select public.grant_training_access((select id from ids where name = 'buyer'), 'cs_course_one', 'pi_course_one', 9900, 'usd', now(), null, now())$$,
  '42501', null, 'browsers cannot grant access');

-- 2. Paying grants a year; duplicates do nothing ---------------------------------------------
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is(public.grant_training_access((select id from ids where name = 'buyer'), 'cs_course_one', 'pi_course_one', 9900, 'usd', now(), 'a8000000-0000-4000-8000-000000000001', now()),
  true, 'a paid course Checkout grants access');
select is(public.grant_training_access((select id from ids where name = 'buyer'), 'cs_course_one', 'pi_course_one', 9900, 'usd', now(), 'a8000000-0000-4000-8000-000000000001', now()),
  false, 'a duplicate event changes nothing');
select is((select count(*) from public.training_access where household_id = (select id from ids where name = 'buyer')), 1::bigint, 'one purchase recorded');
select ok((select abs(extract(epoch from expires_at - (now() + interval '365 days'))) < 5 from public.training_access where stripe_checkout_session_id = 'cs_course_one'),
  'access lasts 365 days from payment');

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000001';
select is((select has_access from public.get_training_access()), true, 'the buyer can train');
select is(public.has_household_entitlement('rbt_bootcamp'), true, 'the household has the RBT entitlement');
select is((select renewable from public.get_training_course_status()), false, 'renewal is not offered with most of the year left');
select is((select count(*) from public.training_access), 1::bigint, 'the household sees its own purchase');
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000003';
select is((select count(*) from public.training_access), 0::bigint, 'other households cannot see it');
select is((select has_access from public.get_training_access()), false, 'other households get no access');

-- 3. Renewing near the end stacks on the remaining time ---------------------------------------
reset role;
update public.training_access set expires_at = now() + interval '10 days', starts_at = now() - interval '355 days',
  purchased_at = now() - interval '355 days' where stripe_checkout_session_id = 'cs_course_one';
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000001';
select is((select renewable from public.get_training_course_status()), true, 'renewal is offered in the last 30 days');
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select public.grant_training_access((select id from ids where name = 'buyer'), 'cs_course_two', 'pi_course_two', 9900, 'usd', now(), null, now());
select ok((select abs(extract(epoch from expires_at - (now() + interval '375 days'))) < 5 from public.training_access where stripe_checkout_session_id = 'cs_course_two'),
  'a renewal starts when the current access ends');

-- 4. Refunds revoke; an early refund blocks a late grant -----------------------------------------
select is(public.revoke_training_access('pi_course_two', now()), (select id from ids where name = 'buyer'), 'a full refund revokes that purchase');
select is((select status from public.training_access where stripe_payment_intent_id = 'pi_course_two'), 'refunded', 'the purchase is marked refunded');
select is(public.revoke_training_access('pi_course_two', now()), (select id from ids where name = 'buyer'), 'a repeated refund event is harmless');
select is(public.revoke_training_access('pi_service_payment', now()), null, 'other payments are ignored');

select is(public.revoke_training_access('pi_course_early', now(), (select id from ids where name = 'other')),
  (select id from ids where name = 'other'), 'a refund seen before its purchase is remembered');
select is(public.grant_training_access((select id from ids where name = 'other'), 'cs_course_early', 'pi_course_early', 9900, 'usd', now(), null, now()),
  false, 'the late purchase event does not grant access');
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000003';
select is((select has_access from public.get_training_access()), false, 'the refunded household has no access');

-- 5. Grandfathered subscribers and expiry ----------------------------------------------------------
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000002';
select is((select has_access from public.get_training_access()), true, 'an active monthly subscriber keeps access');
select is((select legacy_subscription_active from public.get_training_course_status()), true, 'the legacy subscription is reported');
reset role;
update public.billing_subscriptions set current_period_end = now() - interval '1 minute' where stripe_subscription_id = 'sub_legacy1';
update public.training_access set expires_at = now() - interval '1 minute', starts_at = now() - interval '366 days'
where stripe_checkout_session_id = 'cs_course_one';
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
select is((select has_access from public.get_training_access()), false, 'access ends with the subscription period');
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000001';
select is((select has_access from public.get_training_access()), false, 'access ends when the year is over');
select is((select renewable from public.get_training_course_status()), true, 'an expired household can renew');

select * from finish();
rollback;
