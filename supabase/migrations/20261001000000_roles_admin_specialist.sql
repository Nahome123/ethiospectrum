-- Role model update:
--   1. The content_editor role is removed. Existing content editors become
--      members, and resource management is administrator-only.
--   2. Administrators also hold the specialist role: every specialist check
--      accepts an administrator, and administrators have a specialist profile
--      so they can be matched and assigned to service requests.
--   3. Administrators cannot use household (member) features: they cannot
--      join a household, and household permission checks refuse them. The app
--      shows them the member area as a read-only preview.
--   4. A role change signs the user out of every session and records when the
--      role changed, so the app can require a fresh sign-in.

-- 1. Remove content_editor ---------------------------------------------------

update public.user_roles set role = 'member' where role = 'content_editor';

create or replace function private.can_manage_resources()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_current_user_administrator();
$$;

-- Rebuild app_role without the label. Only user_roles.role and three function
-- signatures use the type; their definitions are captured fully qualified,
-- dropped, and replayed against the new type.
set search_path = '';

create temporary table role_function_definitions on commit drop as
select pg_catalog.pg_get_functiondef(p.oid) as definition
from pg_catalog.pg_proc as p
where p.oid in (
  'private.current_app_role()'::pg_catalog.regprocedure,
  'public.admin_list_users(text, text, integer)'::pg_catalog.regprocedure
);

reset search_path;

drop function private.current_app_role();
drop function public.admin_list_users(text, text, integer);
drop function public.admin_set_user_role(uuid, public.app_role);

alter table public.user_roles alter column role drop default;
alter type public.app_role rename to app_role_with_content_editor;
create type public.app_role as enum ('member', 'specialist', 'administrator');
alter table public.user_roles alter column role type public.app_role using role::text::public.app_role;
alter table public.user_roles alter column role set default 'member'::public.app_role;
drop type public.app_role_with_content_editor;

do $$
declare
  definition text;
begin
  for definition in select d.definition from role_function_definitions as d loop
    execute definition;
  end loop;
end;
$$;

revoke all on function private.current_app_role() from public, anon;
grant execute on function private.current_app_role() to authenticated;
revoke all on function public.admin_list_users(text, text, integer) from public, anon;
grant execute on function public.admin_list_users(text, text, integer) to authenticated;

-- 4. Role changes revoke sessions --------------------------------------------
--
-- granted_at now moves only when the role actually changes; the app compares
-- it with the session's sign-in time. Deleting auth.sessions also removes the
-- refresh tokens, so the user cannot silently refresh into the new role.

create function public.admin_set_user_role(target_user_id uuid, input_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_administrator();
  previous_role public.app_role;
begin
  if target_user_id = actor and input_role <> 'administrator'::public.app_role then
    raise exception 'Administrators cannot remove their own administrator role.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'User is unavailable.' using errcode = '42501';
  end if;

  select role into previous_role from public.user_roles where user_id = target_user_id for update;
  if previous_role is not distinct from input_role then
    return;
  end if;

  insert into public.user_roles (user_id, role, granted_by, granted_at)
  values (target_user_id, input_role, actor, now())
  on conflict (user_id) do update
  set role = excluded.role, granted_by = actor, granted_at = now(), updated_at = now();

  begin
    delete from auth.sessions where user_id = target_user_id;
  exception when insufficient_privilege then
    -- The app still requires a fresh sign-in through user_roles.granted_at.
    null;
  end;

  if input_role = 'specialist'::public.app_role then
    insert into public.specialists (user_id, availability_status)
    values (target_user_id, 'available')
    on conflict (user_id) do nothing;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor, 'user_role_changed', 'user', target_user_id,
    jsonb_build_object('role', input_role, 'previous_role', coalesce(previous_role, 'member'::public.app_role))
  );
end;
$$;

revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;

-- 2. Administrators hold the specialist role --------------------------------

do $$
declare
  target pg_catalog.regprocedure;
  definition text;
  updated text;
begin
  foreach target in array array[
    'private.current_specialist_profile_id()',
    'private.is_assigned_open_request_specialist(uuid)',
    'private.is_eligible_specialist(uuid)',
    'private.is_request_specialist(uuid)',
    'public.list_assignable_specialists()',
    'public.admin_list_specialists()',
    'public.admin_list_matching_specialists(uuid)',
    'public.admin_assign_service_specialist(uuid, uuid, integer)'
  ]::pg_catalog.regprocedure[] loop
    definition := pg_catalog.pg_get_functiondef(target);
    updated := pg_catalog.regexp_replace(
      definition,
      '(\w+)\.role = ''specialist''::public\.app_role',
      '\1.role in (''specialist''::public.app_role, ''administrator''::public.app_role)',
      'g'
    );
    if updated = definition then
      raise exception 'No specialist role check found in %', target;
    end if;
    execute updated;
  end loop;
end;
$$;

-- Every administrator has a specialist profile, however the role was granted
-- (including a bootstrap administrator set by direct SQL). Specialists get
-- theirs from admin_set_user_role, as before.
create function private.ensure_specialist_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'administrator'::public.app_role then
    insert into public.specialists (user_id, availability_status)
    values (new.user_id, 'available')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_specialist_profile() from public, anon, authenticated;

create trigger user_roles_ensure_specialist_profile
after insert or update of role on public.user_roles
for each row execute function private.ensure_specialist_profile();

insert into public.specialists (user_id, availability_status)
select role_row.user_id, 'available'
from public.user_roles as role_row
where role_row.role in ('specialist'::public.app_role, 'administrator'::public.app_role)
on conflict (user_id) do nothing;

-- 3. Administrators cannot use household features ---------------------------

create or replace function private.household_actor_can(target_household uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and not private.is_current_user_administrator()
    and exists (
      select 1
      from public.household_members as membership
      join public.households as household on household.id = membership.household_id
      where membership.household_id = target_household
        and membership.user_id = auth.uid()
        and membership.status = 'active'
        and household.deleted_at is null
        and (
          membership.permission = 'owner'::public.household_permission
          or (
            membership.permission = 'member'::public.household_permission
            and required_permission = any(membership.caregiver_permissions)
          )
        )
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
  select auth.uid() is not null
    and not private.is_current_user_administrator()
    and exists (
      select 1
      from public.household_members as membership
      join public.households as household on household.id = membership.household_id
      where membership.household_id = target_household
        and membership.user_id = auth.uid()
        and membership.status = 'active'
        and membership.permission = any(required_permissions)
        and household.deleted_at is null
    );
$$;

create function private.reject_administrator_household_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and exists (
    select 1 from public.user_roles
    where user_id = new.user_id and role = 'administrator'::public.app_role
  ) then
    raise exception 'Administrators cannot join a household.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_administrator_household_membership() from public, anon, authenticated;

create trigger household_members_reject_administrators
before insert or update of status, user_id on public.household_members
for each row execute function private.reject_administrator_household_membership();
