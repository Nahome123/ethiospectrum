-- Member resource discovery: controlled curation metadata, private bookmarks, and roadmap links.

alter table public.resources
  add column resource_type text not null default 'article',
  add column featured_rank smallint;

alter table public.resources
  add constraint resources_resource_type_valid
    check (resource_type in ('article', 'guide', 'video', 'template', 'event_recap')),
  add constraint resources_featured_rank_valid
    check (featured_rank is null or featured_rank between 1 and 1000);

alter table public.resource_audit_events
  drop constraint resource_audit_events_action_check,
  add constraint resource_audit_events_action_check
    check (action in (
      'created',
      'updated',
      'submitted',
      'withdrawn',
      'approved',
      'rejected',
      'published',
      'unpublished',
      'archived',
      'restored',
      'discovery_metadata_updated'
    ));

create index resources_discovery_order_idx
  on public.resources(featured_rank, published_at desc, id)
  where status = 'published' and archived_at is null;

create table public.resource_bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, resource_id)
);

alter table public.resource_bookmarks enable row level security;
alter table public.resource_bookmarks force row level security;

create policy resource_bookmarks_read_own
  on public.resource_bookmarks
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.resource_bookmarks from public, anon, authenticated;
grant select on table public.resource_bookmarks to authenticated;

create index roadmap_items_resource_source_idx
  on public.roadmap_items(household_id, created_by, source_id)
  where source_type = 'resource' and source_id is not null;

create or replace function public.list_member_resources(
  input_locale text,
  input_query text default null,
  input_category text default null,
  input_resource_type text default null,
  input_bookmarked_only boolean default false,
  input_assigned_only boolean default false,
  input_featured_only boolean default false,
  input_page integer default 1,
  input_page_size integer default 12
)
returns table(
  slug text,
  category text,
  resource_type text,
  published_at timestamptz,
  title text,
  summary text,
  selected_locale text,
  using_english_fallback boolean,
  is_bookmarked boolean,
  is_assigned boolean,
  is_featured boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_query text := nullif(btrim(coalesce(input_query, '')), '');
  page_offset integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to browse member resources.' using errcode = '42501';
  end if;
  if input_locale not in ('en', 'am', 'es')
    or char_length(coalesce(normalized_query, '')) > 100
    or (input_category is not null and input_category not in ('general', 'healthcare', 'education', 'therapy', 'benefits', 'legal', 'family_support', 'other'))
    or (input_resource_type is not null and input_resource_type not in ('article', 'guide', 'video', 'template', 'event_recap'))
    or input_page is null or input_page < 1
    or input_page_size is null or input_page_size < 1 or input_page_size > 24 then
    raise exception 'Resource discovery input is invalid.' using errcode = '22023';
  end if;

  page_offset := (input_page - 1) * input_page_size;

  return query
  with selected as (
    select
      resource.id,
      resource.slug,
      resource.category,
      resource.resource_type,
      resource.published_at,
      resource.featured_rank,
      coalesce(localized.title, english.title) as title,
      coalesce(localized.summary, english.summary) as summary,
      coalesce(localized.locale, 'en') as selected_locale,
      input_locale <> 'en' and localized.id is null as using_english_fallback
    from public.resources as resource
    join public.resource_translations as english
      on english.resource_id = resource.id
      and english.locale = 'en'
      and english.review_status = 'approved'
    left join public.resource_translations as localized
      on localized.resource_id = resource.id
      and localized.locale = input_locale
      and input_locale in ('am', 'es')
      and localized.review_status = 'approved'
      and localized.source_translation_version = english.version
    where resource.status = 'published'
      and resource.archived_at is null
  ), decorated as (
    select
      selected.*,
      exists (
        select 1 from public.resource_bookmarks as bookmark
        where bookmark.user_id = current_user_id and bookmark.resource_id = selected.id
      ) as is_bookmarked,
      exists (
        select 1 from public.resource_account_access as access
        where access.user_id = current_user_id and access.resource_id = selected.id
      ) as is_assigned
    from selected
  ), filtered as (
    select *
    from decorated
    where (input_category is null or decorated.category = input_category)
      and (input_resource_type is null or decorated.resource_type = input_resource_type)
      and (not input_bookmarked_only or decorated.is_bookmarked)
      and (not input_assigned_only or decorated.is_assigned)
      and (not input_featured_only or decorated.featured_rank is not null)
      and (
        normalized_query is null
        or position(lower(normalized_query) in lower(decorated.title || ' ' || decorated.summary)) > 0
      )
  )
  select
    filtered.slug,
    filtered.category,
    filtered.resource_type,
    filtered.published_at,
    filtered.title,
    filtered.summary,
    filtered.selected_locale,
    filtered.using_english_fallback,
    filtered.is_bookmarked,
    filtered.is_assigned,
    filtered.featured_rank is not null,
    count(*) over()
  from filtered
  order by
    case when input_featured_only then filtered.featured_rank end asc nulls last,
    filtered.published_at desc nulls last,
    filtered.slug
  limit input_page_size
  offset page_offset;
end;
$$;

create or replace function public.get_member_resource(input_slug text, input_locale text)
returns table(
  slug text,
  category text,
  resource_type text,
  published_at timestamptz,
  title text,
  summary text,
  body text,
  selected_locale text,
  using_english_fallback boolean,
  is_bookmarked boolean,
  is_assigned boolean,
  is_on_roadmap boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required to read member resources.' using errcode = '42501';
  end if;
  if input_locale not in ('en', 'am', 'es')
    or char_length(btrim(coalesce(input_slug, ''))) < 3
    or char_length(btrim(coalesce(input_slug, ''))) > 120 then
    raise exception 'Resource request is invalid.' using errcode = '22023';
  end if;

  return query
  select
    resource.slug,
    resource.category,
    resource.resource_type,
    resource.published_at,
    coalesce(localized.title, english.title),
    coalesce(localized.summary, english.summary),
    coalesce(localized.body, english.body),
    coalesce(localized.locale, 'en'),
    input_locale <> 'en' and localized.id is null,
    exists (
      select 1 from public.resource_bookmarks as bookmark
      where bookmark.user_id = current_user_id and bookmark.resource_id = resource.id
    ),
    exists (
      select 1 from public.resource_account_access as access
      where access.user_id = current_user_id and access.resource_id = resource.id
    ),
    exists (
      select 1 from public.roadmap_items as item
      where item.created_by = current_user_id
        and item.source_type = 'resource'
        and item.source_id = resource.id
        and item.archived_at is null
    )
  from public.resources as resource
  join public.resource_translations as english
    on english.resource_id = resource.id
    and english.locale = 'en'
    and english.review_status = 'approved'
  left join public.resource_translations as localized
    on localized.resource_id = resource.id
    and localized.locale = input_locale
    and input_locale in ('am', 'es')
    and localized.review_status = 'approved'
    and localized.source_translation_version = english.version
  where resource.slug = btrim(input_slug)
    and resource.status = 'published'
    and resource.archived_at is null;
end;
$$;

create or replace function public.set_resource_bookmark(input_slug text, input_bookmarked boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_resource_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to save resources.' using errcode = '42501';
  end if;
  if input_bookmarked is null then
    raise exception 'Bookmark input is invalid.' using errcode = '22023';
  end if;

  select resource.id into target_resource_id
  from public.resources as resource
  join public.resource_translations as english
    on english.resource_id = resource.id
    and english.locale = 'en'
    and english.review_status = 'approved'
  where resource.slug = btrim(coalesce(input_slug, ''))
    and resource.status = 'published'
    and resource.archived_at is null;

  if target_resource_id is null then
    raise exception 'Resource is unavailable.' using errcode = '42501';
  end if;

  if input_bookmarked then
    insert into public.resource_bookmarks(user_id, resource_id)
    values(current_user_id, target_resource_id)
    on conflict do nothing;
  else
    delete from public.resource_bookmarks as bookmark
    where bookmark.user_id = current_user_id and bookmark.resource_id = target_resource_id;
  end if;

  return input_bookmarked;
end;
$$;

create or replace function public.add_resource_to_roadmap(input_slug text, input_locale text)
returns table(item_id uuid, already_exists boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_household_id uuid;
  current_permission public.household_permission;
  default_roadmap_id uuid;
  selected_resource record;
  existing_item public.roadmap_items%rowtype;
  created_item_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to add a resource to the roadmap.' using errcode = '42501';
  end if;
  if input_locale not in ('en', 'am', 'es') then
    raise exception 'Resource roadmap input is invalid.' using errcode = '22023';
  end if;

  select
    resource.id,
    resource.category,
    coalesce(localized.title, english.title) as title,
    coalesce(localized.summary, english.summary) as summary
  into selected_resource
  from public.resources as resource
  join public.resource_translations as english
    on english.resource_id = resource.id
    and english.locale = 'en'
    and english.review_status = 'approved'
  left join public.resource_translations as localized
    on localized.resource_id = resource.id
    and localized.locale = input_locale
    and input_locale in ('am', 'es')
    and localized.review_status = 'approved'
    and localized.source_translation_version = english.version
  where resource.slug = btrim(coalesce(input_slug, ''))
    and resource.status = 'published'
    and resource.archived_at is null;

  if selected_resource.id is null then
    raise exception 'Resource is unavailable.' using errcode = '42501';
  end if;

  select membership.household_id, membership.permission
  into current_household_id, current_permission
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = current_user_id
    and membership.status = 'active'
    and household.deleted_at is null
  order by membership.joined_at asc nulls last, membership.created_at, membership.id
  limit 1;

  if current_household_id is null or current_permission = 'viewer' then
    raise exception 'Roadmap creation is unavailable.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || selected_resource.id::text, 24024));

  select * into existing_item
  from public.roadmap_items as item
  where item.household_id = current_household_id
    and item.created_by = current_user_id
    and item.source_type = 'resource'
    and item.source_id = selected_resource.id
  order by item.created_at
  limit 1
  for update;

  if found then
    if existing_item.archived_at is not null then
      update public.roadmap_items as item
      set archived_at = null, updated_at = now()
      where item.id = existing_item.id;
    end if;
    item_id := existing_item.id;
    already_exists := true;
    return next;
    return;
  end if;

  insert into public.roadmaps(household_id, title, status, is_household_default)
  values(current_household_id, 'Household roadmap', 'active', true)
  on conflict (household_id) where is_household_default
  do update set updated_at = now()
  returning id into default_roadmap_id;

  insert into public.roadmap_items(
    roadmap_id,
    household_id,
    created_by,
    assigned_to,
    title,
    description,
    category,
    priority,
    status,
    sort_order,
    source_type,
    source_id,
    idempotency_key
  ) values (
    default_roadmap_id,
    current_household_id,
    current_user_id,
    current_user_id,
    selected_resource.title,
    selected_resource.summary,
    selected_resource.category,
    'medium',
    'not_started',
    coalesce((select max(item.sort_order) + 1024 from public.roadmap_items as item where item.household_id = current_household_id and item.archived_at is null), 1024),
    'resource',
    selected_resource.id,
    selected_resource.id
  )
  returning id into created_item_id;

  item_id := created_item_id;
  already_exists := false;
  return next;
end;
$$;

create or replace function public.update_resource_discovery_metadata(
  target_resource_id uuid,
  expected_version integer,
  input_resource_type text,
  input_featured_rank integer default null
)
returns table(resource_id uuid, resource_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_resource public.resources%rowtype;
begin
  if not private.can_manage_resources() then
    raise exception 'Resource management is unavailable.' using errcode = '42501';
  end if;
  if input_resource_type not in ('article', 'guide', 'video', 'template', 'event_recap')
    or (input_featured_rank is not null and (input_featured_rank < 1 or input_featured_rank > 1000)) then
    raise exception 'Resource discovery metadata is invalid.' using errcode = '22023';
  end if;

  select * into current_resource
  from public.resources as resource
  where resource.id = target_resource_id
  for update;

  if not found or expected_version is null or current_resource.version <> expected_version then
    raise exception 'Resource is stale.' using errcode = '40001';
  end if;

  update public.resources as resource
  set resource_type = input_resource_type,
      featured_rank = input_featured_rank,
      version = resource.version + 1,
      updated_by = actor
  where resource.id = current_resource.id
  returning resource.id, resource.version into resource_id, resource_version;

  insert into public.resource_audit_events(
    resource_id,
    actor_user_id,
    action,
    from_status,
    to_status,
    resource_version,
    safe_metadata
  ) values (
    current_resource.id,
    actor,
    'discovery_metadata_updated',
    current_resource.status,
    current_resource.status,
    resource_version,
    jsonb_build_object('resource_type', input_resource_type, 'featured_rank', input_featured_rank)
  );

  return next;
end;
$$;

revoke all on function public.list_member_resources(text,text,text,text,boolean,boolean,boolean,integer,integer) from public, anon;
revoke all on function public.get_member_resource(text,text) from public, anon;
revoke all on function public.set_resource_bookmark(text,boolean) from public, anon;
revoke all on function public.add_resource_to_roadmap(text,text) from public, anon;
revoke all on function public.update_resource_discovery_metadata(uuid,integer,text,integer) from public, anon;

grant execute on function public.list_member_resources(text,text,text,text,boolean,boolean,boolean,integer,integer) to authenticated;
grant execute on function public.get_member_resource(text,text) to authenticated;
grant execute on function public.set_resource_bookmark(text,boolean) to authenticated;
grant execute on function public.add_resource_to_roadmap(text,text) to authenticated;
grant execute on function public.update_resource_discovery_metadata(uuid,integer,text,integer) to authenticated;
