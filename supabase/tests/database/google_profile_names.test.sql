begin;

select no_plan();

-- Synthetic users: a form sign-up, and three Google-style profiles.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'form@example.test', 'x', now(), '{"provider": "email"}', '{"first_name": "Hana", "last_name": "Bekele", "given_name": "Ignored"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'given@example.test', '', now(), '{"provider": "google"}', '{"given_name": "Selam", "family_name": "Tadesse", "full_name": "Selam Tadesse"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'full@example.test', '', now(), '{"provider": "google"}', '{"full_name": "  Abebe   Kebede  Alemu "}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'none@example.test', '', now(), '{"provider": "google"}', '{}', now(), now());

select is((select first_name || ' / ' || last_name from public.profiles where id = 'f1000000-0000-4000-8000-000000000001'),
  'Hana / Bekele', 'sign-up form names win');
select is((select first_name || ' / ' || last_name from public.profiles where id = 'f1000000-0000-4000-8000-000000000002'),
  'Selam / Tadesse', 'Google given and family names are used');
select is((select first_name || ' / ' || last_name from public.profiles where id = 'f1000000-0000-4000-8000-000000000003'),
  'Abebe / Kebede Alemu', 'a Google full name is split at the first space');
select is((select coalesce(first_name, 'null') || ' / ' || coalesce(last_name, 'null') from public.profiles where id = 'f1000000-0000-4000-8000-000000000004'),
  'null / null', 'no name stays empty');
select is((select role from public.user_roles where user_id = 'f1000000-0000-4000-8000-000000000002'),
  'member', 'a Google account starts as a member');
select is((select count(*) from public.household_members where user_id = 'f1000000-0000-4000-8000-000000000002'),
  0::bigint, 'a Google account sets up its household on the dashboard, not automatically');

select * from finish();
rollback;
