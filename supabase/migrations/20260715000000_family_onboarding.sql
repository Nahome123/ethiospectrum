-- ETH-010: family onboarding persists a validated household and its consent record in one transaction.

create or replace function public.complete_household_onboarding(raw_name text, raw_policy_version text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := btrim(coalesce(raw_name, ''));
  normalized_policy_version text := btrim(coalesce(raw_policy_version, ''));
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

  insert into public.consents (user_id, consent_type, policy_version)
  values (current_user_id, 'household_onboarding', normalized_policy_version)
  on conflict (user_id, consent_type, policy_version) do nothing;

  -- Onboarding is idempotent: an account with an active household keeps it instead of creating a duplicate.
  select membership.household_id into existing_household_id
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = current_user_id
    and membership.status = 'active'
    and household.deleted_at is null
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

revoke all on function public.complete_household_onboarding(text, text) from public, anon;
grant execute on function public.complete_household_onboarding(text, text) to authenticated;
grant select on table public.consents to authenticated;
