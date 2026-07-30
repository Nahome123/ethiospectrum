-- Resources are private to explicitly assigned Ethiospectrum accounts.
create table public.resource_account_access (
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (resource_id, user_id)
);
alter table public.resource_account_access enable row level security;
alter table public.resource_account_access force row level security;
insert into public.resource_account_access(resource_id,user_id,assigned_by)
  select id, author_id, author_id from public.resources where author_id is not null
  on conflict do nothing;

create or replace function private.can_access_assigned_resource(target_resource_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.resource_account_access access where access.resource_id=target_resource_id and access.user_id=auth.uid());
$$;
drop policy if exists resources_published_read on public.resources;
drop policy if exists resource_translations_read on public.resource_translations;
create policy resources_assigned_published_read on public.resources for select using (private.can_manage_resources() or (status='published' and archived_at is null and private.can_access_assigned_resource(id)));
create policy resource_translations_assigned_read on public.resource_translations for select using (private.can_manage_resources() or (locale='en' and review_status='approved' and exists(select 1 from public.resources resource where resource.id=resource_id and resource.status='published' and resource.archived_at is null and private.can_access_assigned_resource(resource.id))));
create policy resource_account_access_read on public.resource_account_access for select using (private.can_manage_resources() or user_id=auth.uid());
grant select on public.resource_account_access to authenticated;

create or replace function public.list_resource_account_holders()
returns table(user_id uuid, first_name text, last_name text) language plpgsql security definer set search_path='' as $$
begin
  if not private.can_manage_resources() then raise exception 'Resource access is unavailable.' using errcode='42501'; end if;
  return query select profile.id, profile.first_name, profile.last_name from public.profiles profile order by profile.first_name nulls last, profile.last_name nulls last, profile.id;
end;
$$;
create or replace function public.set_resource_account_access(target_resource_id uuid, expected_version integer, input_user_ids uuid[])
returns table(resource_id uuid, resource_version integer) language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); resource public.resources%rowtype; requested_count integer;
begin
  if not private.can_manage_resources() then raise exception 'Resource access is unavailable.' using errcode='42501'; end if;
  select * into resource from public.resources r where r.id=target_resource_id for update;
  if not found or resource.version<>expected_version then raise exception 'Resource is stale.' using errcode='40001'; end if;
  select count(distinct value) into requested_count from unnest(coalesce(input_user_ids,array[]::uuid[])) value;
  if requested_count=0 or requested_count<>(select count(*) from public.profiles where id=any(input_user_ids)) then raise exception 'Select at least one valid account.' using errcode='22023'; end if;
  delete from public.resource_account_access as access where access.resource_id=resource.id;
  insert into public.resource_account_access(resource_id,user_id,assigned_by) select resource.id, value, actor from unnest(input_user_ids) value on conflict do nothing;
  update public.resources set version=version+1,updated_by=actor where id=resource.id returning version into resource_version;
  resource_id:=resource.id; return next;
end;
$$;
revoke all on function public.list_resource_account_holders(), public.set_resource_account_access(uuid,integer,uuid[]) from public,anon;
grant execute on function public.list_resource_account_holders(), public.set_resource_account_access(uuid,integer,uuid[]) to authenticated;
