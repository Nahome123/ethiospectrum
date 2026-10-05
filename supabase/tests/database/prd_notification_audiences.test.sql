begin;

select no_plan();

-- Synthetic administrator who also receives specialist notifications.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'audience-admin@example.test', 'x', now(), '{}', '{"first_name": "Admin"}', now(), now());

delete from public.notifications where recipient_id = 'c2000000-0000-4000-8000-000000000001';
insert into public.notifications (recipient_id, notification_type) values
  ('c2000000-0000-4000-8000-000000000001', 'admin_new_request'),
  ('c2000000-0000-4000-8000-000000000001', 'admin_refund_requested'),
  ('c2000000-0000-4000-8000-000000000001', 'specialist_new_assignment'),
  ('c2000000-0000-4000-8000-000000000001', 'payment_confirmed');

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000001';

select is((select unread_count from public.get_notification_summary()), 4::bigint, 'without an audience every notification counts');
select is((select unread_count from public.get_notification_summary('admin')), 2::bigint, 'the admin audience counts only admin notifications');
select is((select unread_count from public.get_notification_summary('specialist')), 1::bigint, 'the specialist audience counts only specialist notifications');
select is((select unread_count from public.get_notification_summary('family')), 1::bigint, 'the family audience counts the remaining notifications');
select is((select array_agg(notification_type order by notification_type) from public.list_notifications(1, 'specialist')), array['specialist_new_assignment'],
  'the specialist list shows only specialist notifications');
select is((select count(*) from public.list_notifications(1, 'admin')), 2::bigint, 'the admin list shows only admin notifications');
select throws_ok($$select * from public.list_notifications(1, 'everyone')$$, '22023', null, 'an unknown audience is refused');

select is(public.mark_notifications_read(null, 'admin'), 2, 'mark all read in the admin workspace marks only admin notifications');
select is((select unread_count from public.get_notification_summary('specialist')), 1::bigint, 'specialist notifications stay unread');
select is((select unread_count from public.get_notification_summary('family')), 1::bigint, 'family notifications stay unread');

select * from finish();
rollback;
