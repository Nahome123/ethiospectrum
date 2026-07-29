-- ETH-010 corrective migration: make household onboarding profile-aware,
-- serialized per account, and safe against duplicate active memberships.
--
-- Do not edit 20260715000000_family_onboarding.sql: it may already be applied.

do $$
begin
  if exists (
    select 1
    from public.household_members as membership
    join public.households as household on household.id = membership.household_id
    where membership.status = 'active'
      and household.deleted_at is null
    group by membership.user_id
    having count(*) > 1
  ) then
    raise exception
      'Cannot add the single-active-household guarantee while duplicate active memberships exist. Resolve those records through the reviewed data-repair process first.';
  end if;
end;
$$;

create unique index if not exists household_members_one_active_membership_per_user_idx
  on public.household_members (user_id)
  where status = 'active';

create or replace function public.create_household(raw_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := btrim(coalesce(raw_name, ''));
  existing_household_id uuid;
  created_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to create a household.' using errcode = '42501';
  end if;
  if char_length(normalized_name) = 0 or char_length(normalized_name) > 160 then
    raise exception 'Household name must be between 1 and 160 characters.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select membership.household_id
  into existing_household_id
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = current_user_id
    and membership.status = 'active'
    and household.deleted_at is null
  order by membership.joined_at asc nulls last, membership.created_at asc, membership.id asc
  limit 1;

  if existing_household_id is not null then
    return existing_household_id;
  end if;

  insert into public.households (name, primary_owner_id, created_by)
  values (normalized_name, current_user_id, current_user_id)
  returning id into created_household_id;

  insert into public.household_members (household_id, user_id, permission, status, joined_at)
  values (created_household_id, current_user_id, 'owner', 'active', now());

  return created_household_id;
end;
$$;

drop function public.complete_household_onboarding(text, text);

create function public.complete_household_onboarding(
  raw_name text,
  raw_policy_version text,
  raw_first_name text default null,
  raw_last_name text default null,
  raw_preferred_locale text default 'en',
  raw_timezone text default 'UTC'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := btrim(coalesce(raw_name, ''));
  normalized_policy_version text := btrim(coalesce(raw_policy_version, ''));
  normalized_first_name text := nullif(btrim(coalesce(raw_first_name, '')), '');
  normalized_last_name text := nullif(btrim(coalesce(raw_last_name, '')), '');
  normalized_preferred_locale text := btrim(coalesce(raw_preferred_locale, ''));
  normalized_timezone text := btrim(coalesce(raw_timezone, ''));
  existing_household_id uuid;
  created_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to complete onboarding.' using errcode = '42501';
  end if;
  if char_length(normalized_name) = 0 or char_length(normalized_name) > 160 then
    raise exception 'Household name must be between 1 and 160 characters.' using errcode = '22023';
  end if;
  if char_length(normalized_policy_version) = 0 or char_length(normalized_policy_version) > 64 then
    raise exception 'A consent policy version is required.' using errcode = '22023';
  end if;
  if normalized_first_name is null or char_length(normalized_first_name) > 80 then
    raise exception 'A first name of up to 80 characters is required.' using errcode = '22023';
  end if;
  if normalized_last_name is not null and char_length(normalized_last_name) > 80 then
    raise exception 'A last name must be at most 80 characters.' using errcode = '22023';
  end if;
  if normalized_preferred_locale not in ('en', 'am', 'es') then
    raise exception 'A supported preferred locale is required.' using errcode = '22023';
  end if;
  if normalized_timezone = '' or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = normalized_timezone
  ) then
    raise exception 'A valid IANA timezone is required.' using errcode = '22023';
  end if;

  -- Serialize competing browser tabs and direct RPC retries for this account.
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  insert into public.profiles (id, first_name, last_name, preferred_locale, timezone)
  values (
    current_user_id,
    normalized_first_name,
    normalized_last_name,
    normalized_preferred_locale,
    normalized_timezone
  )
  on conflict (id) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      preferred_locale = excluded.preferred_locale,
      timezone = excluded.timezone;

  insert into public.consents (user_id, consent_type, policy_version)
  values (current_user_id, 'household_onboarding', normalized_policy_version)
  on conflict (user_id, consent_type, policy_version) do nothing;

  select membership.household_id
  into existing_household_id
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = current_user_id
    and membership.status = 'active'
    and household.deleted_at is null
  order by membership.joined_at asc nulls last, membership.created_at asc, membership.id asc
  limit 1;

  if existing_household_id is not null then
    return existing_household_id;
  end if;

  insert into public.households (name, primary_owner_id, created_by)
  values (normalized_name, current_user_id, current_user_id)
  returning id into created_household_id;

  insert into public.household_members (household_id, user_id, permission, status, joined_at)
  values (created_household_id, current_user_id, 'owner', 'active', now());

  return created_household_id;
end;
$$;

revoke all on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
revoke all on function public.complete_household_onboarding(text, text, text, text, text, text) from public, anon;
grant execute on function public.complete_household_onboarding(text, text, text, text, text, text) to authenticated;
