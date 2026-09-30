-- PRD v1.0: service catalog, disclosed additional fees, consultation topics,
-- specialist capabilities (service x language x delivery method), and the
-- administrator user/role directory.

-- 1. Services ----------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  service_type text not null unique check (
    service_type in ('rbt_bootcamp', 'consultation', 'iep_language_assistance')
  ),
  name text not null check (name = btrim(name) and char_length(name) between 2 and 120),
  description text not null check (description = btrim(description) and char_length(description) between 2 and 2000),
  -- Optional reviewed translations: {"am": {"name": "...", "description": "..."}, "es": {...}}
  localized jsonb not null default '{}'::jsonb check (
    jsonb_typeof(localized) = 'object' and octet_length(localized::text) <= 16384
  ),
  -- Null only for the recurring subscription, whose amount is the configured provider price.
  price_cents integer check (price_cents is null or price_cents between 0 and 1000000),
  currency text not null default 'usd' check (currency = 'usd'),
  payment_type text not null check (payment_type in ('recurring_monthly', 'one_time')),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 15 and 240),
  included_follow_ups integer not null default 0 check (included_follow_ups between 0 and 5),
  -- Standard appointment instructions shown on every appointment: {"en": "...", "am": "...", "es": "..."}
  standard_instructions jsonb not null default '{}'::jsonb check (
    jsonb_typeof(standard_instructions) = 'object' and octet_length(standard_instructions::text) <= 8192
  ),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_payment_shape check (
    (service_type = 'rbt_bootcamp' and payment_type = 'recurring_monthly' and duration_minutes is null)
    or (service_type <> 'rbt_bootcamp' and payment_type = 'one_time' and price_cents is not null and duration_minutes is not null)
  )
);

insert into public.services (
  service_type, name, description, localized, price_cents, payment_type,
  duration_minutes, included_follow_ups, standard_instructions
) values
  (
    'rbt_bootcamp',
    'RBT Boot Camp',
    'A self-paced video library that helps parents understand neurodivergency, complete the Ethiospectrum curriculum, and prepare for an external RBT-related credential or exam. Completing the course is not an RBT certification.',
    '{}'::jsonb, null, 'recurring_monthly', null, 0, '{}'::jsonb
  ),
  (
    'consultation',
    'Consultation',
    'A 60-minute consultation offering general household and service guidance or specific behavioral and educational guidance. One follow-up is included.',
    '{}'::jsonb, 999, 'one_time', 60, 1,
    '{"en": "Please join a few minutes before your scheduled appointment.", "am": "እባክዎ ከቀጠሮዎ ጥቂት ደቂቃዎች ቀደም ብለው ይቀላቀሉ።", "es": "Conéctese unos minutos antes de su cita programada."}'::jsonb
  ),
  (
    'iep_language_assistance',
    'IEP Language Assistance',
    'A 60-minute session to explain an IEP, provide language assistance during a school meeting, and provide written translation. English ↔ Amharic and English ↔ Spanish. One follow-up is included.',
    '{}'::jsonb, 1999, 'one_time', 60, 1,
    '{"en": "Please arrive 10 minutes before your scheduled appointment.", "am": "እባክዎ ከቀጠሮዎ 10 ደቂቃ ቀደም ብለው ይድረሱ።", "es": "Llegue 10 minutos antes de su cita programada."}'::jsonb
  );

-- 2. Additional service fees (never automatic; disclosed and accepted before payment)

create table public.service_fees (
  id uuid primary key default gen_random_uuid(),
  service_type text not null check (service_type in ('consultation', 'iep_language_assistance')),
  name text not null check (name = btrim(name) and char_length(name) between 2 and 120),
  description text not null check (description = btrim(description) and char_length(description) between 2 and 1000),
  amount_cents integer not null check (amount_cents between 1 and 100000),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_fees_active_idx on public.service_fees (service_type) where active;

-- 3. Consultation topics (administrator-configurable) ------------------------

create table public.consultation_topics (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null unique check (topic_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  category text not null check (category in ('general_guidance', 'behavioral_educational')),
  labels jsonb not null check (
    jsonb_typeof(labels) = 'object'
    and char_length(coalesce(labels ->> 'en', '')) between 2 and 120
    and octet_length(labels::text) <= 2048
  ),
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.consultation_topics (topic_key, category, labels, sort_order) values
  ('household_services', 'general_guidance', '{"en": "Navigating household services", "am": "የቤተሰብ አገልግሎቶችን ማሰስ", "es": "Cómo navegar los servicios para la familia"}', 10),
  ('getting_started', 'general_guidance', '{"en": "Getting started after a diagnosis", "am": "ከምርመራ በኋላ መጀመር", "es": "Primeros pasos después de un diagnóstico"}', 20),
  ('behavior_support', 'behavioral_educational', '{"en": "Behavior support at home", "am": "በቤት ውስጥ የባህሪ ድጋፍ", "es": "Apoyo conductual en casa"}', 30),
  ('school_learning', 'behavioral_educational', '{"en": "School and learning guidance", "am": "የትምህርት ቤት እና የመማር መመሪያ", "es": "Orientación escolar y de aprendizaje"}', 40),
  ('communication_skills', 'behavioral_educational', '{"en": "Communication skills", "am": "የመግባቢያ ክህሎቶች", "es": "Habilidades de comunicación"}', 50);

-- 4. Specialist capabilities --------------------------------------------------

create table public.specialist_capabilities (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references public.specialists(id) on delete cascade,
  service_type text not null check (service_type in ('consultation', 'iep_language_assistance')),
  -- For IEP Language Assistance this is the non-English language of an
  -- English <-> X pair; for Consultation it is the session language.
  language text not null check (language in ('en', 'am', 'es')),
  delivery_method text not null check (delivery_method in ('remote', 'in_person')),
  created_at timestamptz not null default now(),
  unique (specialist_id, service_type, language, delivery_method),
  constraint specialist_capabilities_iep_language check (service_type <> 'iep_language_assistance' or language in ('am', 'es'))
);
create index specialist_capabilities_match_idx
  on public.specialist_capabilities (service_type, language, delivery_method);

-- 5. Row-level security ---------------------------------------------------------

alter table public.services enable row level security;
alter table public.services force row level security;
alter table public.service_fees enable row level security;
alter table public.service_fees force row level security;
alter table public.consultation_topics enable row level security;
alter table public.consultation_topics force row level security;
alter table public.specialist_capabilities enable row level security;
alter table public.specialist_capabilities force row level security;

-- The public catalog is marketing information and contains no private data.
create policy services_public_read on public.services
  for select to anon, authenticated using (active or public.is_administrator());
create policy service_fees_read on public.service_fees
  for select to authenticated using (active or public.is_administrator());
create policy consultation_topics_read on public.consultation_topics
  for select to authenticated using (active or public.is_administrator());
create policy specialist_capabilities_read on public.specialist_capabilities
  for select to authenticated
  using (
    public.is_administrator()
    or specialist_id = private.current_specialist_profile_id()
  );

revoke all on public.services, public.service_fees, public.consultation_topics, public.specialist_capabilities
  from public, anon, authenticated;
grant select on public.services to anon, authenticated;
grant select on public.service_fees, public.consultation_topics, public.specialist_capabilities to authenticated;
grant select on public.services, public.service_fees, public.consultation_topics, public.specialist_capabilities to service_role;

-- 6. Administrator configuration functions ------------------------------------

create or replace function private.require_administrator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_current_user_administrator() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.admin_update_service(
  target_service_id uuid,
  expected_version integer,
  input_name text,
  input_description text,
  input_localized jsonb,
  input_included_follow_ups integer,
  input_standard_instructions jsonb,
  input_active boolean,
  input_price_cents integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare next_version integer;
begin
  perform private.require_administrator();
  update public.services
  set name = btrim(input_name),
      description = btrim(input_description),
      localized = coalesce(input_localized, '{}'::jsonb),
      price_cents = case when payment_type = 'recurring_monthly' then input_price_cents else coalesce(input_price_cents, price_cents) end,
      included_follow_ups = coalesce(input_included_follow_ups, included_follow_ups),
      standard_instructions = coalesce(input_standard_instructions, '{}'::jsonb),
      active = coalesce(input_active, active),
      version = version + 1,
      updated_at = now()
  where id = target_service_id and version = expected_version
  returning version into next_version;
  if next_version is null then
    raise exception 'The service changed; refresh and try again.' using errcode = '40001';
  end if;
  return next_version;
end;
$$;

create or replace function public.admin_save_service_fee(
  input_service_type text,
  input_name text,
  input_description text,
  input_amount_cents integer,
  input_active boolean,
  target_fee_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := private.require_administrator(); saved_id uuid;
begin
  if target_fee_id is null then
    insert into public.service_fees (service_type, name, description, amount_cents, active, created_by)
    values (input_service_type, btrim(input_name), btrim(input_description), input_amount_cents, coalesce(input_active, true), actor)
    returning id into saved_id;
  else
    update public.service_fees
    set service_type = input_service_type, name = btrim(input_name), description = btrim(input_description),
        amount_cents = input_amount_cents, active = coalesce(input_active, active), updated_at = now()
    where id = target_fee_id
    returning id into saved_id;
    if saved_id is null then
      raise exception 'Fee is unavailable.' using errcode = '42501';
    end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.admin_save_consultation_topic(
  input_topic_key text,
  input_category text,
  input_labels jsonb,
  input_sort_order integer,
  input_active boolean,
  target_topic_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare saved_id uuid;
begin
  perform private.require_administrator();
  if target_topic_id is null then
    insert into public.consultation_topics (topic_key, category, labels, sort_order, active)
    values (lower(btrim(input_topic_key)), input_category, input_labels, coalesce(input_sort_order, 100), coalesce(input_active, true))
    returning id into saved_id;
  else
    update public.consultation_topics
    set category = input_category, labels = input_labels, sort_order = coalesce(input_sort_order, sort_order),
        active = coalesce(input_active, active), updated_at = now()
    where id = target_topic_id
    returning id into saved_id;
    if saved_id is null then
      raise exception 'Topic is unavailable.' using errcode = '42501';
    end if;
  end if;
  return saved_id;
end;
$$;

-- Users directory for administrators. Email is read from Auth here, so it is
-- never stored in profiles and never exposed to non-administrators.
create or replace function public.admin_list_users(
  input_search text default null,
  input_role text default null,
  input_page integer default 1
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role public.app_role,
  household_name text,
  household_permission public.household_permission,
  specialist_id uuid,
  availability_status text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare normalized_search text := nullif(lower(btrim(coalesce(input_search, ''))), '');
begin
  perform private.require_administrator();
  return query
  select auth_user.id, lower(auth_user.email)::text,
    coalesce(nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''), lower(auth_user.email)::text),
    coalesce(role_row.role, 'member'::public.app_role),
    household.name, membership.permission,
    specialist.id, specialist.availability_status,
    auth_user.created_at,
    count(*) over ()
  from auth.users as auth_user
  left join public.profiles as profile on profile.id = auth_user.id
  left join public.user_roles as role_row on role_row.user_id = auth_user.id
  left join lateral (
    select member_row.household_id, member_row.permission
    from public.household_members as member_row
    where member_row.user_id = auth_user.id and member_row.status = 'active'
    order by (member_row.permission = 'owner') desc, member_row.created_at
    limit 1
  ) as membership on true
  left join public.households as household on household.id = membership.household_id and household.deleted_at is null
  left join public.specialists as specialist on specialist.user_id = auth_user.id
  where (normalized_search is null
      or lower(auth_user.email) like '%' || normalized_search || '%'
      or lower(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')) like '%' || normalized_search || '%')
    and (input_role is null or coalesce(role_row.role, 'member'::public.app_role)::text = input_role)
  order by auth_user.created_at desc, auth_user.id
  limit 25 offset (greatest(coalesce(input_page, 1), 1) - 1) * 25;
end;
$$;

create or replace function public.admin_set_user_role(target_user_id uuid, input_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := private.require_administrator();
begin
  if target_user_id = actor and input_role <> 'administrator'::public.app_role then
    raise exception 'Administrators cannot remove their own administrator role.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'User is unavailable.' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role, granted_by, granted_at)
  values (target_user_id, input_role, actor, now())
  on conflict (user_id) do update
  set role = excluded.role, granted_by = actor, granted_at = now(), updated_at = now();
  if input_role = 'specialist'::public.app_role then
    insert into public.specialists (user_id, availability_status)
    values (target_user_id, 'available')
    on conflict (user_id) do nothing;
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (actor, 'user_role_changed', 'user', target_user_id, jsonb_build_object('role', input_role));
end;
$$;

create or replace function public.admin_update_specialist(
  target_specialist_id uuid,
  input_availability_status text,
  input_capabilities jsonb,
  input_bio text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare capability jsonb;
begin
  perform private.require_administrator();
  if input_availability_status not in ('available', 'unavailable')
    or jsonb_typeof(coalesce(input_capabilities, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(input_capabilities, '[]'::jsonb)) > 24 then
    raise exception 'Invalid specialist settings.' using errcode = '22023';
  end if;
  update public.specialists
  set bio = nullif(left(btrim(coalesce(input_bio, '')), 2000), ''),
      availability_status = input_availability_status,
      languages = coalesce((
        select array_agg(distinct value ->> 'language' order by value ->> 'language')
        from jsonb_array_elements(coalesce(input_capabilities, '[]'::jsonb)) as value
      ), array[]::text[]),
      specialties = coalesce((
        select array_agg(distinct value ->> 'service_type' order by value ->> 'service_type')
        from jsonb_array_elements(coalesce(input_capabilities, '[]'::jsonb)) as value
      ), array[]::text[]),
      updated_at = now()
  where id = target_specialist_id;
  if not found then
    raise exception 'Specialist is unavailable.' using errcode = '42501';
  end if;
  delete from public.specialist_capabilities where specialist_id = target_specialist_id;
  for capability in select value from jsonb_array_elements(coalesce(input_capabilities, '[]'::jsonb)) loop
    insert into public.specialist_capabilities (specialist_id, service_type, language, delivery_method)
    values (target_specialist_id, capability ->> 'service_type', capability ->> 'language', capability ->> 'delivery_method')
    on conflict do nothing;
  end loop;
end;
$$;

create or replace function public.admin_list_specialists()
returns table (
  specialist_id uuid,
  user_id uuid,
  display_name text,
  email text,
  bio text,
  availability_status text,
  capabilities jsonb,
  active_request_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator();
  return query
  select specialist.id, specialist.user_id,
    coalesce(nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Ethiospectrum specialist'),
    lower(auth_user.email)::text,
    specialist.bio, specialist.availability_status,
    coalesce((
      select jsonb_agg(jsonb_build_object('service_type', capability.service_type, 'language', capability.language, 'delivery_method', capability.delivery_method)
        order by capability.service_type, capability.language, capability.delivery_method)
      from public.specialist_capabilities as capability where capability.specialist_id = specialist.id
    ), '[]'::jsonb),
    0::bigint
  from public.specialists as specialist
  join public.user_roles as role_row on role_row.user_id = specialist.user_id and role_row.role = 'specialist'::public.app_role
  left join public.profiles as profile on profile.id = specialist.user_id
  left join auth.users as auth_user on auth_user.id = specialist.user_id
  order by 3, specialist.id;
end;
$$;

revoke all on function private.require_administrator() from public, anon;
grant execute on function private.require_administrator() to authenticated;
revoke all on function public.admin_update_service(uuid, integer, text, text, jsonb, integer, jsonb, boolean, integer) from public, anon;
revoke all on function public.admin_save_service_fee(text, text, text, integer, boolean, uuid) from public, anon;
revoke all on function public.admin_save_consultation_topic(text, text, jsonb, integer, boolean, uuid) from public, anon;
revoke all on function public.admin_list_users(text, text, integer) from public, anon;
revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
revoke all on function public.admin_update_specialist(uuid, text, jsonb, text) from public, anon;
revoke all on function public.admin_list_specialists() from public, anon;
grant execute on function public.admin_update_service(uuid, integer, text, text, jsonb, integer, jsonb, boolean, integer) to authenticated;
grant execute on function public.admin_save_service_fee(text, text, text, integer, boolean, uuid) to authenticated;
grant execute on function public.admin_save_consultation_topic(text, text, jsonb, integer, boolean, uuid) to authenticated;
grant execute on function public.admin_list_users(text, text, integer) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_update_specialist(uuid, text, jsonb, text) to authenticated;
grant execute on function public.admin_list_specialists() to authenticated;
