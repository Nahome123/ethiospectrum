-- ETH-009: secure application identity and household boundary.
-- This migration corrects the foundation draft without rewriting migration history.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$
begin
  create type public.household_permission as enum ('owner', 'administrator', 'member', 'viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.membership_status as enum ('active', 'invited', 'removed');
exception
  when duplicate_object then null;
end $$;

drop policy if exists profiles_self on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists households_access on public.households;
drop policy if exists members_access on public.household_members;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'member',
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Remove dependent draft policies before removing the legacy embedded profile role.
drop policy if exists published_resources_read on public.resources;
drop policy if exists resource_editor_write on public.resources;
drop policy if exists resource_translations_read on public.resource_translations;
drop policy if exists resource_translations_editor_write on public.resource_translations;
create or replace function public.is_administrator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = 'administrator'::public.app_role
  );
$$;

drop index if exists public.profiles_email_lower_idx;
alter table public.profiles drop column if exists email;
alter table public.profiles drop column if exists role;
alter table public.profiles
  alter column first_name type text using nullif(btrim(first_name), ''),
  alter column last_name type text using nullif(btrim(last_name), '');
alter table public.profiles
  add constraint profiles_first_name_valid check (first_name is null or (first_name = btrim(first_name) and char_length(first_name) <= 80)),
  add constraint profiles_last_name_valid check (last_name is null or (last_name = btrim(last_name) and char_length(last_name) <= 80));

alter table public.households add column if not exists created_by uuid;
alter table public.households add column if not exists deleted_at timestamptz;
update public.households set created_by = primary_owner_id where created_by is null;
alter table public.households alter column created_by set not null;
alter table public.households drop constraint if exists households_primary_owner_id_fkey;
alter table public.households
  add constraint households_primary_owner_id_fkey foreign key (primary_owner_id) references auth.users(id);
alter table public.households
  add constraint households_created_by_fkey foreign key (created_by) references auth.users(id);
alter table public.households
  add constraint households_name_trimmed check (name = btrim(name));

alter table public.household_members add column if not exists permission public.household_permission;
update public.household_members
set permission = case permission_level::text
  when 'owner' then 'owner'::public.household_permission
  when 'editor' then 'administrator'::public.household_permission
  else 'viewer'::public.household_permission
end
where permission is null;
alter table public.household_members alter column permission set default 'member';
alter table public.household_members alter column permission set not null;
alter table public.household_members add column if not exists membership_state public.membership_status;
update public.household_members
set membership_state = status::text::public.membership_status
where membership_state is null;
drop index if exists public.household_members_user_idx;
alter table public.household_members drop column status;
alter table public.household_members rename column membership_state to status;
alter table public.household_members drop column permission_level;
alter table public.household_members alter column relationship drop not null;
alter table public.household_members add column if not exists invited_by uuid references auth.users(id) on delete set null;
alter table public.household_members add column if not exists joined_at timestamptz;
update public.household_members set joined_at = created_at where status = 'active' and joined_at is null;
alter table public.household_members drop constraint if exists household_members_user_id_fkey;
alter table public.household_members
  add constraint household_members_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.household_members
  add constraint household_members_owner_active check (permission <> 'owner' or status = 'active');
alter table public.household_members
  add constraint household_members_relationship_valid check (relationship is null or (relationship = btrim(relationship) and char_length(relationship) <= 80));

create index if not exists households_primary_owner_idx on public.households(primary_owner_id) where deleted_at is null;
create index if not exists households_created_by_idx on public.households(created_by);
create index if not exists household_members_household_status_idx on public.household_members(household_id, status);
create index if not exists household_members_user_status_idx on public.household_members(user_id, status);
create index if not exists household_members_permission_idx on public.household_members(household_id, permission) where status = 'active';

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.normalize_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.first_name = nullif(btrim(new.first_name), '');
  new.last_name = nullif(btrim(new.last_name), '');
  new.timezone = coalesce(nullif(btrim(new.timezone), ''), 'UTC');
  if new.preferred_locale not in ('en', 'am', 'es') then
    new.preferred_locale = 'en';
  end if;
  return new;
end;
$$;

create or replace function private.normalize_household()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.name = btrim(new.name);
  if char_length(new.name) = 0 or char_length(new.name) > 160 then
    raise exception 'Household name must be between 1 and 160 characters.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.protect_household_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.primary_owner_id is distinct from old.primary_owner_id then
    raise exception 'Household ownership cannot be changed through ordinary member operations.' using errcode = '42501';
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'A soft-deleted household cannot be restored through ordinary member operations.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.normalize_household_member()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.relationship = nullif(btrim(new.relationship), '');
  if new.status = 'active' and new.joined_at is null then
    new.joined_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_normalize on public.profiles;
create trigger profiles_normalize before insert or update on public.profiles for each row execute function private.normalize_profile();
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
drop trigger if exists user_roles_set_updated_at on public.user_roles;
create trigger user_roles_set_updated_at before update on public.user_roles for each row execute function private.set_updated_at();
drop trigger if exists households_normalize on public.households;
create trigger households_normalize before insert or update on public.households for each row execute function private.normalize_household();
drop trigger if exists households_protect_ownership on public.households;
create trigger households_protect_ownership before update on public.households for each row execute function private.protect_household_ownership();
drop trigger if exists households_set_updated_at on public.households;
create trigger households_set_updated_at before update on public.households for each row execute function private.set_updated_at();
drop trigger if exists household_members_normalize on public.household_members;
create trigger household_members_normalize before insert or update on public.household_members for each row execute function private.normalize_household_member();
drop trigger if exists household_members_set_updated_at on public.household_members;
create trigger household_members_set_updated_at before update on public.household_members for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  profile_locale text := coalesce(nullif(btrim(metadata ->> 'preferred_locale'), ''), 'en');
begin
  if profile_locale not in ('en', 'am', 'es') then
    profile_locale := 'en';
  end if;

  insert into public.profiles (id, first_name, last_name, preferred_locale)
  values (
    new.id,
    nullif(left(btrim(coalesce(metadata ->> 'first_name', '')), 80), ''),
    nullif(left(btrim(coalesce(metadata ->> 'last_name', '')), 80), ''),
    profile_locale
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'member')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

insert into public.profiles (id, first_name, last_name, preferred_locale)
select
  users.id,
  nullif(left(btrim(coalesce(users.raw_user_meta_data ->> 'first_name', '')), 80), ''),
  nullif(left(btrim(coalesce(users.raw_user_meta_data ->> 'last_name', '')), 80), ''),
  case when users.raw_user_meta_data ->> 'preferred_locale' in ('en', 'am', 'es') then users.raw_user_meta_data ->> 'preferred_locale' else 'en' end
from auth.users as users
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select users.id, 'member'
from auth.users as users
on conflict (user_id) do nothing;

create or replace function private.is_active_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.household_members as membership
    join public.households as household on household.id = membership.household_id
    where membership.household_id = target_household
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and household.deleted_at is null
  );
$$;

create or replace function private.has_household_permission(
  target_household uuid,
  required_permissions public.household_permission[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.household_members as membership
    where membership.household_id = target_household
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.permission = any(required_permissions)
  );
$$;

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

create or replace function private.is_current_user_administrator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and private.current_app_role() = 'administrator'::public.app_role;
$$;

-- Compatibility wrappers keep future-draft tables deny-by-default while their dedicated issues are pending.
create or replace function public.is_active_household_member(target_household uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.is_active_household_member(target_household); $$;
create or replace function public.is_administrator()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.is_current_user_administrator(); $$;
create or replace function public.can_access_household(target_household uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.is_active_household_member(target_household) or public.is_assigned_specialist(target_household) or private.is_current_user_administrator(); $$;

create or replace function public.create_household(raw_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := btrim(coalesce(raw_name, ''));
  created_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to create a household.' using errcode = '42501';
  end if;
  if char_length(normalized_name) = 0 or char_length(normalized_name) > 160 then
    raise exception 'Household name must be between 1 and 160 characters.' using errcode = '22023';
  end if;

  insert into public.households (name, primary_owner_id, created_by)
  values (normalized_name, current_user_id, current_user_id)
  returning id into created_household_id;

  insert into public.household_members (household_id, user_id, permission, status, joined_at)
  values (created_household_id, current_user_id, 'owner', 'active', now());

  return created_household_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.user_roles enable row level security;
alter table public.user_roles force row level security;
alter table public.households enable row level security;
alter table public.households force row level security;
alter table public.household_members enable row level security;
alter table public.household_members force row level security;

create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy user_roles_select_own on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy households_select_active_members on public.households for select to authenticated using (deleted_at is null and private.is_active_household_member(id));
create policy households_update_owners_and_administrators on public.households for update to authenticated using (deleted_at is null and private.has_household_permission(id, array['owner', 'administrator']::public.household_permission[])) with check (private.has_household_permission(id, array['owner', 'administrator']::public.household_permission[]));
create policy household_members_select_active_members on public.household_members for select to authenticated using (private.is_active_household_member(household_id));

revoke all on table public.profiles, public.user_roles, public.households, public.household_members from anon;
revoke all on table public.profiles, public.user_roles, public.households, public.household_members from authenticated;
grant select, update (first_name, last_name, preferred_locale, timezone) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, update (name, deleted_at) on public.households to authenticated;
grant select on public.household_members to authenticated;

revoke all on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_active_household_member(uuid) to authenticated;
grant execute on function private.has_household_permission(uuid, public.household_permission[]) to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.is_current_user_administrator() to authenticated;
revoke all on all functions in schema private from public, anon;

-- Foundation policies referenced the now-isolated profile role; use the isolated role helper instead.
create policy published_resources_read on public.resources for select using (status = 'published' or private.is_current_user_administrator() or private.current_app_role() = 'content_editor'::public.app_role);
create policy resource_editor_write on public.resources for all using (private.is_current_user_administrator() or private.current_app_role() = 'content_editor'::public.app_role) with check (private.is_current_user_administrator() or private.current_app_role() = 'content_editor'::public.app_role);
create policy resource_translations_read on public.resource_translations for select using (exists (select 1 from public.resources as resource where resource.id = resource_id and (resource.status = 'published' or private.is_current_user_administrator() or private.current_app_role() = 'content_editor'::public.app_role)));
create policy resource_translations_editor_write on public.resource_translations for all using (private.is_current_user_administrator() or private.current_app_role() = 'content_editor'::public.app_role) with check (private.is_current_user_administrator() or private.current_app_role() = 'content_editor'::public.app_role);

revoke all on function private.handle_new_auth_user() from public;
revoke all on function private.set_updated_at() from public;
revoke all on function private.normalize_profile() from public;
revoke all on function private.normalize_household() from public;
revoke all on function private.normalize_household_member() from public;
revoke all on function private.protect_household_ownership() from public;
