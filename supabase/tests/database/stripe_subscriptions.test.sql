begin;

select no_plan();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'billing-owner@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'billing-house-admin@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'billing-member@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'billing-viewer@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'billing-outsider@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'billing-platform-admin@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'billing-specialist@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'billing-editor@example.test', 'x', now(), '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('e2000000-0000-4000-8000-000000000001', 'Synthetic billing household', 'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000002', 'Other synthetic household', 'e1000000-0000-4000-8000-000000000005', 'e1000000-0000-4000-8000-000000000005');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'administrator', 'active', now()),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'member', 'active', now()),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004', 'viewer', 'active', now()),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000005', 'owner', 'active', now());

update public.user_roles set role = 'administrator' where user_id = 'e1000000-0000-4000-8000-000000000006';
update public.user_roles set role = 'specialist' where user_id = 'e1000000-0000-4000-8000-000000000007';
update public.user_roles set role = 'content_editor' where user_id = 'e1000000-0000-4000-8000-000000000008';

select has_table('public', 'billing_customers', 'billing customers table exists');
select has_table('public', 'billing_subscriptions', 'billing subscriptions table exists');
select has_table('public', 'billing_invoices', 'billing invoices table exists');
select has_table('public', 'stripe_webhook_events', 'Stripe webhook event table exists');
select has_table('public', 'billing_events', 'billing audit table exists');
select has_column('public', 'billing_customers', 'household_id', 'customer is household-scoped');
select has_column('public', 'billing_subscriptions', 'entitlement_status', 'subscription stores trusted entitlement state');
select has_column('public', 'billing_subscriptions', 'provider_updated_at', 'subscription stores ordering timestamp');
select has_column('public', 'billing_subscriptions', 'cancel_at_period_end', 'subscription stores scheduled cancellation');
select has_column('public', 'billing_invoices', 'hosted_invoice_url', 'invoice stores a safe hosted URL');
select has_column('public', 'billing_invoices', 'provider_updated_at', 'invoice stores an event-ordering timestamp');
select has_column('public', 'stripe_webhook_events', 'processing_status', 'webhook stores processing state');
select has_column('public', 'stripe_webhook_events', 'attempt_count', 'webhook stores bounded attempts');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.billing_customers'::regclass), 'customer RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.billing_subscriptions'::regclass), 'subscription RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.billing_invoices'::regclass), 'invoice RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.stripe_webhook_events'::regclass), 'webhook RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.billing_events'::regclass), 'billing audit RLS is enabled and forced');

select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'billing_customers' and indexdef like '%UNIQUE%household_id%'), 'one Stripe customer per household is enforced');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'billing_customers' and indexdef like '%UNIQUE%stripe_customer_id%'), 'Stripe customer IDs are unique');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'billing_subscriptions' and indexdef like '%UNIQUE%stripe_subscription_id%'), 'Stripe subscription IDs are unique');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'billing_invoices' and indexdef like '%UNIQUE%stripe_invoice_id%'), 'Stripe invoice IDs are unique');
select col_is_pk('public', 'stripe_webhook_events', 'stripe_event_id', 'Stripe Event IDs are the idempotency key');

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok($$select public.link_household_billing_customer('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'cus_syntheticBilling1')$$, 'service boundary links a customer for a verified owner');
select lives_ok($$select public.link_household_billing_customer('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'cus_syntheticBilling1')$$, 'customer linking is idempotent');
select throws_ok($$select public.link_household_billing_customer('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'cus_forgedAdmin1')$$, '42501', null, 'household administrator cannot be used as Checkout actor');
select lives_ok($$select public.sync_billing_subscription('e2000000-0000-4000-8000-000000000001', 'cus_syntheticBilling1', 'sub_syntheticBilling1', 'price_syntheticMonthly1', 'month', 'active', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', false, '2026-08-10T12:00:00Z', null)$$, 'trusted active subscription is synchronized');
select lives_ok($$select public.sync_billing_invoice('e2000000-0000-4000-8000-000000000001', 'in_syntheticBilling1', 'sub_syntheticBilling1', 2500, 2500, 'usd', 'paid', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-10T12:00:00Z', 'SYN-0001', 'https://invoice.stripe.test/synthetic')$$, 'safe invoice metadata is synchronized');
select is((select invoice_pdf_url from public.billing_invoices where stripe_invoice_id = 'in_syntheticBilling1'), null::text, 'invoice PDF URL remains unpersisted pending privacy approval');
select is(public.sync_billing_subscription('e2000000-0000-4000-8000-000000000001', 'cus_syntheticBilling1', 'sub_syntheticBilling1', 'price_syntheticMonthly1', 'month', 'past_due', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', false, '2026-08-10T12:00:00Z', null), false, 'same-timestamp subscription retry is a no-op');
select is((select stripe_status from public.billing_subscriptions where stripe_subscription_id = 'sub_syntheticBilling1'), 'active', 'same-timestamp subscription retry cannot repeat or alter state');
select is(public.sync_billing_invoice('e2000000-0000-4000-8000-000000000001', 'in_syntheticBilling1', 'sub_syntheticBilling1', 2500, 0, 'usd', 'open', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-10T12:00:00Z', 'SYN-0001', 'https://invoice.stripe.test/synthetic'), false, 'same-timestamp invoice retry is a no-op');
select is((select status from public.billing_invoices where stripe_invoice_id = 'in_syntheticBilling1'), 'paid', 'same-timestamp invoice retry cannot repeat or alter state');
select is(public.begin_stripe_webhook_event('evt_syntheticBilling1', 'customer.subscription.updated', '2026-07-01', '2026-08-10T12:00:00Z'), 'process', 'first webhook delivery starts processing');
select lives_ok($$select public.complete_stripe_webhook_event('evt_syntheticBilling1')$$, 'webhook processing completes');
select is(public.begin_stripe_webhook_event('evt_syntheticBilling1', 'customer.subscription.updated', '2026-07-01', '2026-08-10T12:00:00Z'), 'duplicate', 'processed webhook duplicate is idempotent');
reset role;

set local role anon;
select throws_ok($$select * from public.billing_customers$$, '42501', null, 'anonymous cannot read billing customers');
select throws_ok($$select * from public.billing_subscriptions$$, '42501', null, 'anonymous cannot read billing subscriptions');
select throws_ok($$select * from public.billing_invoices$$, '42501', null, 'anonymous cannot read invoices');
select throws_ok($$select * from public.stripe_webhook_events$$, '42501', null, 'anonymous cannot read webhook state');
select throws_ok($$select * from public.billing_events$$, '42501', null, 'anonymous cannot read billing audit history');
select throws_ok($$select * from public.get_household_billing_summary()$$, '42501', null, 'anonymous cannot execute the household billing projection');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.billing_customers$$, '42501', null, 'household owner cannot read provider customer identifiers');
select throws_ok($$select * from public.billing_subscriptions$$, '42501', null, 'household owner cannot read raw subscription identifiers');
select throws_ok($$select * from public.billing_invoices$$, '42501', null, 'household owner cannot read raw invoice identifiers');
select is((select count(*) from public.list_household_billing_invoices()), 1::bigint, 'owner receives invoice projection');
select ok(public.has_household_entitlement('family_plus'), 'owner receives active Family Plus entitlement');
select is((select plan_key from public.get_household_billing_summary()), 'family_plus', 'owner receives the paid plan projection');
select throws_ok($$insert into public.billing_customers (household_id, stripe_customer_id) values ('e2000000-0000-4000-8000-000000000001', 'cus_browserForgery1')$$, '42501', null, 'owner cannot insert a billing customer directly');
select throws_ok($$update public.billing_subscriptions set entitlement_status = 'inactive'$$, '42501', null, 'owner cannot mutate entitlement directly');
select throws_ok($$select public.sync_billing_subscription('e2000000-0000-4000-8000-000000000001', 'cus_syntheticBilling1', 'sub_syntheticBilling1', 'price_syntheticMonthly1', 'month', 'active', now(), now() + interval '1 month', false, now(), null)$$, '42501', null, 'browser role cannot call the synchronization function');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000002';
select throws_ok($$select * from public.billing_customers$$, '42501', null, 'household administrator cannot read provider customer identifiers');
select throws_ok($$select * from public.billing_subscriptions$$, '42501', null, 'household administrator cannot read raw subscription identifiers');
select is((select count(*) from public.list_household_billing_invoices()), 1::bigint, 'household administrator reads invoice history');
select is((select can_manage_billing from public.get_household_billing_summary()), false, 'household administrator receives no management authority');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000003';
select throws_ok($$select * from public.billing_subscriptions$$, '42501', null, 'member cannot read raw subscriptions');
select throws_ok($$select * from public.billing_invoices$$, '42501', null, 'member cannot read raw invoices');
select is((select count(*) from public.list_household_billing_invoices()), 0::bigint, 'member receives no invoice projection');
select is((select plan_key from public.get_household_billing_summary()), 'family_plus', 'member receives safe plan status');
select is((select entitlement_status from public.get_household_billing_summary()), 'active', 'member receives safe entitlement status');
select is((select billing_interval from public.get_household_billing_summary()), null, 'member receives no billing interval');
select is((select stripe_status from public.get_household_billing_summary()), null, 'member receives no provider lifecycle state');
select is((select current_period_end from public.get_household_billing_summary()), null, 'member receives no billing period metadata');
select is((select has_stripe_customer from public.get_household_billing_summary()), false, 'member receives no provider customer-link signal');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000004';
select throws_ok($$select * from public.billing_subscriptions$$, '42501', null, 'viewer cannot read raw subscriptions');
select is((select count(*) from public.list_household_billing_invoices()), 0::bigint, 'viewer receives no invoice projection');
select is((select can_view_invoices from public.get_household_billing_summary()), false, 'viewer receives plan-only projection');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000005';
select throws_ok($$select * from public.billing_customers$$, '42501', null, 'cross-household owner cannot query raw customers');
select throws_ok($$select * from public.billing_subscriptions$$, '42501', null, 'cross-household owner cannot query raw subscriptions');
select throws_ok($$select * from public.billing_invoices$$, '42501', null, 'cross-household owner cannot query raw invoices');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000007';
select is((select count(*) from public.get_household_billing_summary()), 0::bigint, 'specialist receives no household billing projection');
select throws_ok($$select * from public.billing_subscriptions$$, '42501', null, 'specialist cannot query raw subscriptions');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000008';
select is((select count(*) from public.get_household_billing_summary()), 0::bigint, 'content editor receives no household billing projection');
select throws_ok($$select * from public.billing_invoices$$, '42501', null, 'content editor cannot query raw invoices');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000006';
select throws_ok($$select * from public.billing_customers$$, '42501', null, 'platform administrator cannot query provider customer identifiers');
select is((select count(*) from public.list_admin_billing_summaries()), 2::bigint, 'platform administrator reads safe household billing summaries');
select is((select count(*) from public.list_admin_billing_invoices('e2000000-0000-4000-8000-000000000001')), 1::bigint, 'platform administrator reads safe invoice metadata');
select throws_ok($$select * from public.stripe_webhook_events$$, '42501', null, 'platform administrator cannot query raw event identifiers');
select throws_ok($$update public.billing_subscriptions set entitlement_status = 'inactive'$$, '42501', null, 'platform administrator cannot manually mutate entitlement');
reset role;

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is(public.sync_billing_subscription('e2000000-0000-4000-8000-000000000001', 'cus_syntheticBilling1', 'sub_syntheticBilling1', 'price_syntheticMonthly1', 'month', 'past_due', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', false, '2026-08-11T12:00:00Z', null), true, 'newer failed provider state is applied');
select is((select entitlement_status from public.billing_subscriptions where household_id = 'e2000000-0000-4000-8000-000000000001'), 'inactive', 'payment failure revokes entitlement without a grace period');
select is(public.sync_billing_subscription('e2000000-0000-4000-8000-000000000001', 'cus_syntheticBilling1', 'sub_syntheticBilling1', 'price_syntheticMonthly1', 'month', 'active', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', false, '2026-08-09T12:00:00Z', null), false, 'older provider event cannot overwrite newer state');
select is((select stripe_status from public.billing_subscriptions where household_id = 'e2000000-0000-4000-8000-000000000001'), 'past_due', 'out-of-order event does not regress subscription state');
select is(public.sync_billing_subscription('e2000000-0000-4000-8000-000000000001', 'cus_syntheticBilling1', 'sub_syntheticBilling1', 'price_syntheticMonthly1', 'month', 'canceled', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', false, '2026-08-12T12:00:00Z', '2026-08-12T12:00:00Z'), true, 'authoritative cancellation ends the subscription');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';
select is((select plan_key from public.get_household_billing_summary()), 'free', 'ended subscription projects the household back to the free plan');
select is((select entitlement_status from public.get_household_billing_summary()), 'inactive', 'ended subscription remains fail closed');
reset role;
select throws_ok($$update public.billing_events set action = 'entitlement_granted'$$, '42501', 'Billing history is immutable.', 'billing audit history is immutable even for elevated writes');
reset role;

select ok(not has_table_privilege('authenticated', 'public.billing_subscriptions', 'insert'), 'authenticated has no subscription insert grant');
select ok(not has_table_privilege('authenticated', 'public.billing_subscriptions', 'select'), 'authenticated has no raw subscription read grant');
select ok(not has_table_privilege('authenticated', 'public.billing_invoices', 'select'), 'authenticated has no raw invoice read grant');
select ok(not has_table_privilege('authenticated', 'public.billing_subscriptions', 'update'), 'authenticated has no subscription update grant');
select ok(not has_table_privilege('authenticated', 'public.billing_invoices', 'delete'), 'authenticated has no invoice delete grant');
select ok(not has_function_privilege('authenticated', 'public.sync_billing_subscription(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz)', 'execute'), 'authenticated cannot call subscription synchronization');
select ok(not exists (
  select 1 from pg_proc routine join pg_namespace schema on schema.oid = routine.pronamespace
  where schema.nspname in ('public','private')
    and routine.proname like '%grant%entitlement%'
), 'no manual entitlement grant RPC exists');
select ok(not exists (
  select 1 from pg_proc routine join pg_namespace schema on schema.oid = routine.pronamespace
  where schema.nspname in ('public','private')
    and routine.proname like '%billing%'
    and not exists (
      select 1 from unnest(routine.proconfig) config where config like 'search_path=%'
    )
), 'billing functions use fixed empty search paths');
select ok(not exists (
  select 1 from pg_proc routine join pg_namespace schema on schema.oid = routine.pronamespace
  where schema.nspname in ('public','private')
    and routine.proname like '%billing%'
    and pg_get_functiondef(routine.oid) ~* '(send.?email|resend|sms|push)'
), 'ETH-028 database functions contain no ETH-029 email, SMS, or push delivery');
select ok(not exists (
  select 1 from pg_proc routine join pg_namespace schema on schema.oid = routine.pronamespace
  where schema.nspname in ('public','private')
    and routine.proname like '%appointment%'
    and pg_get_functiondef(routine.oid) ~* '(stripe|subscription|invoice|checkout)'
), 'ETH-027 appointment functions remain billing-free');

select * from finish();
rollback;
