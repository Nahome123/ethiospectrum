begin;

select no_plan();

-- Synthetic owner whose household is created automatically.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'resubscribe-owner@example.test', 'x', now(), '{}', '{"last_name": "Resubscribe", "account_intent": "household_owner"}', now(), now());

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to service_role;
insert into ids select 'household', id from public.households where primary_owner_id = 'c5000000-0000-4000-8000-000000000001';

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select lives_ok($$select public.link_household_billing_customer((select id from ids where name = 'household'), 'c5000000-0000-4000-8000-000000000001', 'cus_resubscribe1')$$, 'customer linked');

-- First subscription: active, invoiced, then canceled.
select lives_ok($$select public.sync_billing_subscription((select id from ids where name = 'household'), 'cus_resubscribe1', 'sub_firstPlan1', 'price_monthly1', 'month', 'active', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', false, '2026-08-01T00:00:00Z', null)$$, 'first subscription active');
select lives_ok($$select public.sync_billing_invoice((select id from ids where name = 'household'), 'in_firstPlan1', 'sub_firstPlan1', 999, 999, 'usd', 'paid', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z', null, null)$$, 'first invoice recorded');
select lives_ok($$select public.sync_billing_subscription((select id from ids where name = 'household'), 'cus_resubscribe1', 'sub_firstPlan1', 'price_monthly1', 'month', 'canceled', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', false, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')$$, 'first subscription ends');

-- Subscribing again creates a second subscription on the same customer.
select lives_ok($$select public.sync_billing_subscription((select id from ids where name = 'household'), 'cus_resubscribe1', 'sub_secondPlan1', 'price_monthly1', 'month', 'active', '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', false, '2026-10-01T00:00:00Z', null)$$,
  'the new subscription replaces the ended one even though old invoices exist');
select lives_ok($$select public.sync_billing_invoice((select id from ids where name = 'household'), 'in_secondPlan1', 'sub_secondPlan1', 999, 999, 'usd', 'paid', '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', null, null)$$, 'second invoice recorded');
select is((select stripe_subscription_id || '/' || entitlement_status from public.billing_subscriptions where household_id = (select id from ids where name = 'household')),
  'sub_secondPlan1/active', 'the household has its new, active subscription');

-- Reconciliation replays everything with a newer timestamp.
select is(public.sync_billing_subscription((select id from ids where name = 'household'), 'cus_resubscribe1', 'sub_firstPlan1', 'price_monthly1', 'month', 'canceled', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', false, '2026-10-14T00:00:00Z', '2026-09-01T00:00:00Z'),
  false, 'replaying the ended subscription is ignored');
select lives_ok($$select public.sync_billing_invoice((select id from ids where name = 'household'), 'in_firstPlan1', 'sub_firstPlan1', 999, 999, 'usd', 'paid', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-08-01T00:00:00Z', '2026-10-14T00:00:00Z', null, null)$$,
  'an invoice of the ended subscription can still be refreshed');
select is((select stripe_subscription_id || '/' || entitlement_status from public.billing_subscriptions where household_id = (select id from ids where name = 'household')),
  'sub_secondPlan1/active', 'access stays active after reconciliation');
select is((select count(*) from public.billing_invoices where household_id = (select id from ids where name = 'household')), 2::bigint, 'both invoices are kept');

-- The live subscription itself can still end normally.
select is(public.sync_billing_subscription((select id from ids where name = 'household'), 'cus_resubscribe1', 'sub_secondPlan1', 'price_monthly1', 'month', 'canceled', '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', false, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z'),
  true, 'the current subscription can still be canceled');

select * from finish();
rollback;
