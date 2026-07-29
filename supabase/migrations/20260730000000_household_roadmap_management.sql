-- ETH-021: household roadmap and action-item management.
--
-- The original foundation included draft roadmap and reminder tables. This
-- migration corrects the roadmap model in place while deliberately leaving
-- public.reminders untouched for ETH-022.

alter table public.roadmaps
  add column if not exists is_household_default boolean not null default false;

create unique index if not exists roadmaps_one_default_per_household_idx
  on public.roadmaps (household_id)
  where is_household_default;

alter table public.roadmap_items
  add column if not exists household_id uuid references public.households(id) on delete cascade,
  add column if not exists dependent_id uuid references public.dependents(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete restrict,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists sort_order bigint,
  add column if not exists archived_at timestamptz,
  add column if not exists idempotency_key uuid,
  add column if not exists updated_at timestamptz not null default now();

with ranked as (
  select
    sibling.id,
    row_number() over (
      partition by sibling.roadmap_id
      order by sibling.created_at, sibling.id
    )::bigint as position
  from public.roadmap_items as sibling
)
update public.roadmap_items as item
set
  household_id = roadmap.household_id,
  dependent_id = coalesce(item.dependent_id, roadmap.dependent_id),
  created_by = coalesce(item.created_by, household.primary_owner_id),
  title = coalesce(nullif(left(btrim(item.title), 160), ''), 'Untitled action item'),
  description = nullif(left(btrim(item.description), 4000), ''),
  category = case
    when lower(coalesce(btrim(item.category), '')) in (
      'general', 'healthcare', 'education', 'therapy', 'benefits', 'legal', 'family_support', 'other'
    ) then lower(btrim(item.category))
    else 'general'
  end,
  priority = case
    when item.priority in ('low', 'medium', 'high') then item.priority
    else 'medium'
  end,
  status = case
    when item.status = 'open' then 'not_started'
    when item.status in ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled') then item.status
    else 'not_started'
  end,
  sort_order = coalesce(item.sort_order, ranked.position * 1024),
  completed_at = case when item.status = 'completed' then coalesce(item.completed_at, now()) else null end,
  updated_at = coalesce(item.updated_at, now())
from public.roadmaps as roadmap
join public.households as household on household.id = roadmap.household_id
, ranked
where roadmap.id = item.roadmap_id
  and ranked.id = item.id;

alter table public.roadmap_items
  alter column household_id set not null,
  alter column created_by set not null,
  alter column category set default 'general',
  alter column category set not null,
  alter column priority set default 'medium',
  alter column priority set not null,
  alter column status set default 'not_started',
  alter column sort_order set default 1024,
  alter column sort_order set not null;

alter table public.roadmap_items
  drop constraint if exists roadmap_items_status_check,
  drop constraint if exists roadmap_items_title_valid,
  drop constraint if exists roadmap_items_description_valid,
  drop constraint if exists roadmap_items_category_valid,
  drop constraint if exists roadmap_items_priority_valid,
  drop constraint if exists roadmap_items_status_valid,
  drop constraint if exists roadmap_items_completion_valid;

alter table public.roadmap_items
  add constraint roadmap_items_title_valid check (
    title = btrim(title) and char_length(title) between 1 and 160
  ),
  add constraint roadmap_items_description_valid check (
    description is null or (description = btrim(description) and char_length(description) between 1 and 4000)
  ),
  add constraint roadmap_items_category_valid check (
    category in ('general', 'healthcare', 'education', 'therapy', 'benefits', 'legal', 'family_support', 'other')
  ),
  add constraint roadmap_items_priority_valid check (priority in ('low', 'medium', 'high')),
  add constraint roadmap_items_status_valid check (
    status in ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled')
  ),
  add constraint roadmap_items_completion_valid check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  );

create unique index if not exists roadmap_items_creation_idempotency_idx
  on public.roadmap_items (household_id, created_by, idempotency_key);
create index if not exists roadmap_items_household_active_order_idx
  on public.roadmap_items (household_id, sort_order, id)
  where archived_at is null;
create index if not exists roadmap_items_household_archived_idx
  on public.roadmap_items (household_id, archived_at desc, updated_at desc)
  where archived_at is not null;
create index if not exists roadmap_items_assigned_active_idx
  on public.roadmap_items (household_id, assigned_to, sort_order)
  where archived_at is null;
create index if not exists roadmap_items_dependent_active_idx
  on public.roadmap_items (household_id, dependent_id, sort_order)
  where archived_at is null and dependent_id is not null;
create index if not exists roadmap_items_due_date_active_idx
  on public.roadmap_items (household_id, due_date)
  where archived_at is null and due_date is not null;

drop trigger if exists roadmap_items_set_updated_at on public.roadmap_items;
create trigger roadmap_items_set_updated_at
  before update on public.roadmap_items
  for each row execute function private.set_updated_at();

create or replace function private.roadmap_item_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_household_id uuid;
begin
  new.title := btrim(new.title);
  new.description := nullif(btrim(new.description), '');

  if char_length(new.title) = 0 or char_length(new.title) > 160 then
    raise exception 'Roadmap item title is invalid.' using errcode = '22023';
  end if;
  if new.description is not null and char_length(new.description) > 4000 then
    raise exception 'Roadmap item description is invalid.' using errcode = '22023';
  end if;

  select roadmap.household_id into parent_household_id
  from public.roadmaps as roadmap
  where roadmap.id = new.roadmap_id;
  if parent_household_id is null or parent_household_id is distinct from new.household_id then
    raise exception 'Roadmap item household is invalid.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and (
    new.roadmap_id is distinct from old.roadmap_id
    or new.household_id is distinct from old.household_id
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Roadmap item ownership is immutable.' using errcode = '42501';
  end if;

  if new.dependent_id is not null and (
    tg_op = 'INSERT' or new.dependent_id is distinct from old.dependent_id
  ) and not exists (
    select 1
    from public.dependents as dependent
    where dependent.id = new.dependent_id
      and dependent.household_id = new.household_id
      and dependent.archived_at is null
  ) then
    raise exception 'Roadmap item dependent is invalid.' using errcode = '42501';
  end if;

  if new.assigned_to is not null and (
    tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to
  ) and not exists (
    select 1
    from public.household_members as membership
    where membership.household_id = new.household_id
      and membership.user_id = new.assigned_to
      and membership.status = 'active'
  ) then
    raise exception 'Roadmap item assignee is invalid.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists roadmap_items_validate_integrity on public.roadmap_items;
create trigger roadmap_items_validate_integrity
  before insert or update on public.roadmap_items
  for each row execute function private.roadmap_item_integrity();

create or replace function private.current_roadmap_permission(target_household_id uuid)
returns public.household_permission
language sql
stable
security definer
set search_path = ''
as $$
  select membership.permission
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.household_id = target_household_id
    and membership.user_id = auth.uid()
    and membership.status = 'active'
    and household.deleted_at is null
  limit 1;
$$;

create or replace function private.roadmap_status_transition_allowed(
  current_status text,
  next_status text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select (current_status, next_status) in (
    ('not_started', 'in_progress'),
    ('not_started', 'blocked'),
    ('not_started', 'completed'),
    ('not_started', 'cancelled'),
    ('in_progress', 'not_started'),
    ('in_progress', 'blocked'),
    ('in_progress', 'completed'),
    ('in_progress', 'cancelled'),
    ('blocked', 'not_started'),
    ('blocked', 'in_progress'),
    ('blocked', 'completed'),
    ('blocked', 'cancelled'),
    ('completed', 'not_started'),
    ('completed', 'in_progress'),
    ('cancelled', 'not_started')
  );
$$;

alter table public.roadmaps enable row level security;
alter table public.roadmaps force row level security;
alter table public.roadmap_items enable row level security;
alter table public.roadmap_items force row level security;

drop policy if exists roadmaps_access on public.roadmaps;
drop policy if exists roadmap_items_access on public.roadmap_items;
drop policy if exists roadmap_items_read_active_household on public.roadmap_items;
create policy roadmap_items_read_active_household
  on public.roadmap_items
  for select to authenticated
  using (
    private.is_active_household_member(household_id)
    and (
      archived_at is null
      or private.has_household_permission(
        household_id,
        array['owner', 'administrator']::public.household_permission[]
      )
    )
  );

revoke all on table public.roadmaps, public.roadmap_items from anon;
revoke all on table public.roadmaps, public.roadmap_items from authenticated;
grant select on table public.roadmap_items to authenticated;

create or replace function public.list_roadmap_assignable_members()
returns table(user_id uuid, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_household_id uuid;
begin
  select membership.household_id into current_household_id
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = auth.uid()
    and membership.status = 'active'
    and household.deleted_at is null
  limit 1;

  if current_household_id is null then
    raise exception 'Roadmap access is unavailable.' using errcode = '42501';
  end if;

  return query
  select
    membership.user_id,
    coalesce(nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Household member')
  from public.household_members as membership
  left join public.profiles as profile on profile.id = membership.user_id
  where membership.household_id = current_household_id
    and membership.status = 'active'
  order by lower(coalesce(profile.first_name, '')), lower(coalesce(profile.last_name, '')), membership.user_id;
end;
$$;

create or replace function public.list_roadmap_items(
  input_archived boolean default false,
  input_assignee text default 'all',
  input_status text default null,
  input_priority text default null,
  input_category text default null,
  input_dependent_id uuid default null,
  input_overdue boolean default false,
  input_completed boolean default false,
  input_sort text default 'manual',
  input_page integer default 1,
  input_item_id uuid default null
)
returns table(
  id uuid,
  title text,
  description text,
  category text,
  priority text,
  status text,
  due_date date,
  sort_order bigint,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  dependent_id uuid,
  dependent_name text,
  assigned_to uuid,
  assignee_name text,
  assignee_is_former boolean,
  created_by uuid,
  can_edit boolean,
  can_archive boolean,
  can_restore boolean,
  can_reorder boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_household_id uuid;
  current_permission public.household_permission;
  current_user_id uuid := auth.uid();
  page_offset integer;
begin
  select membership.household_id, membership.permission
  into current_household_id, current_permission
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = current_user_id
    and membership.status = 'active'
    and household.deleted_at is null
  limit 1;

  if current_household_id is null then
    raise exception 'Roadmap access is unavailable.' using errcode = '42501';
  end if;
  if input_archived and current_permission not in ('owner', 'administrator') then
    return;
  end if;
  if input_assignee not in ('all', 'me', 'unassigned')
    or input_sort not in ('manual', 'due_date', 'priority', 'updated', 'created')
    or input_page < 1 or input_page > 100000
    or (input_status is not null and input_status not in ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled'))
    or (input_priority is not null and input_priority not in ('low', 'medium', 'high'))
    or (input_category is not null and input_category not in ('general', 'healthcare', 'education', 'therapy', 'benefits', 'legal', 'family_support', 'other')) then
    raise exception 'Roadmap filters are invalid.' using errcode = '22023';
  end if;

  page_offset := (input_page - 1) * 20;

  return query
  with visible as (
    select
      item.id,
      item.title,
      item.description,
      item.category,
      item.priority,
      item.status,
      item.due_date,
      item.sort_order,
      item.completed_at,
      item.archived_at,
      item.created_at,
      item.updated_at,
      item.dependent_id,
      coalesce(dependent.preferred_name, dependent.first_name) as dependent_name,
      item.assigned_to,
      case when assignee_membership.status = 'active'
        then nullif(btrim(concat_ws(' ', assignee_profile.first_name, assignee_profile.last_name)), '')
        else null
      end as assignee_name,
      item.assigned_to is not null and coalesce(assignee_membership.status <> 'active', true) as assignee_is_former,
      item.created_by,
      (
        current_permission in ('owner', 'administrator')
        or (current_permission = 'member' and (item.created_by = current_user_id or item.assigned_to = current_user_id))
      ) as can_edit,
      current_permission in ('owner', 'administrator') as can_archive,
      current_permission in ('owner', 'administrator') as can_restore,
      current_permission in ('owner', 'administrator') as can_reorder
    from public.roadmap_items as item
    left join public.dependents as dependent on dependent.id = item.dependent_id
    left join public.household_members as assignee_membership
      on assignee_membership.household_id = item.household_id
      and assignee_membership.user_id = item.assigned_to
    left join public.profiles as assignee_profile on assignee_profile.id = item.assigned_to
    where item.household_id = current_household_id
      and (input_archived = (item.archived_at is not null))
      and (input_item_id is null or item.id = input_item_id)
      and (input_assignee = 'all' or (input_assignee = 'me' and item.assigned_to = current_user_id) or (input_assignee = 'unassigned' and item.assigned_to is null))
      and (input_status is null or item.status = input_status)
      and (input_priority is null or item.priority = input_priority)
      and (input_category is null or item.category = input_category)
      and (input_dependent_id is null or item.dependent_id = input_dependent_id)
      and (not input_completed or item.status = 'completed')
      and (not input_overdue or (
        item.due_date < current_date
        and item.status not in ('completed', 'cancelled')
        and item.archived_at is null
      ))
  )
  select
    visible.*,
    count(*) over () as total_count
  from visible
  order by
    case when input_sort = 'manual' then visible.sort_order end asc,
    case when input_sort = 'due_date' then visible.due_date end asc nulls last,
    case when input_sort = 'priority' then case visible.priority when 'high' then 3 when 'medium' then 2 else 1 end end desc,
    case when input_sort = 'updated' then visible.updated_at end desc,
    case when input_sort = 'created' then visible.created_at end desc,
    visible.id
  limit 20 offset page_offset;
end;
$$;

create or replace function public.create_roadmap_item(
  input_title text,
  input_description text default null,
  input_category text default 'general',
  input_priority text default 'medium',
  input_status text default 'not_started',
  input_due_date date default null,
  input_dependent_id uuid default null,
  input_assigned_to uuid default null,
  input_idempotency_key uuid default null
)
returns table(id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_household_id uuid;
  current_permission public.household_permission;
  default_roadmap_id uuid;
  existing_item public.roadmap_items%rowtype;
  item_id uuid;
begin
  select membership.household_id, membership.permission
  into current_household_id, current_permission
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = current_user_id
    and membership.status = 'active'
    and household.deleted_at is null
  limit 1;
  if current_household_id is null or current_permission = 'viewer' then
    raise exception 'Roadmap creation is unavailable.' using errcode = '42501';
  end if;
  if input_idempotency_key is null then
    raise exception 'Roadmap creation key is required.' using errcode = '22023';
  end if;
  if input_category not in ('general', 'healthcare', 'education', 'therapy', 'benefits', 'legal', 'family_support', 'other')
    or input_priority not in ('low', 'medium', 'high')
    or input_status not in ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled') then
    raise exception 'Roadmap item values are invalid.' using errcode = '22023';
  end if;
  if current_permission = 'member' and input_assigned_to is distinct from existing_item.assigned_to then
    if (input_assigned_to is not null and input_assigned_to <> current_user_id)
      or (existing_item.assigned_to is not null and existing_item.assigned_to <> current_user_id) then
      raise exception 'Roadmap member assignment is invalid.' using errcode = '42501';
    end if;
  end if;

  select * into existing_item
  from public.roadmap_items as item
  where item.household_id = current_household_id
    and item.created_by = current_user_id
    and item.idempotency_key = input_idempotency_key;
  if found then
    return query select existing_item.id, existing_item.updated_at;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_household_id::text, 21021));
  insert into public.roadmaps (household_id, title, status, is_household_default)
  values (current_household_id, 'Household roadmap', 'active', true)
  on conflict (household_id) where is_household_default
  do update set updated_at = now()
  returning public.roadmaps.id into default_roadmap_id;

  insert into public.roadmap_items (
    roadmap_id, household_id, dependent_id, created_by, assigned_to,
    title, description, category, priority, status, due_date, sort_order,
    completed_at, idempotency_key
  ) values (
    default_roadmap_id, current_household_id, input_dependent_id, current_user_id, input_assigned_to,
    btrim(input_title), nullif(btrim(input_description), ''), input_category, input_priority, input_status, input_due_date,
    coalesce((select max(sort_order) + 1024 from public.roadmap_items where household_id = current_household_id and archived_at is null), 1024),
    case when input_status = 'completed' then now() else null end, input_idempotency_key
  )
  on conflict (household_id, created_by, idempotency_key)
  do update set idempotency_key = excluded.idempotency_key
  returning public.roadmap_items.id, public.roadmap_items.updated_at into id, updated_at;

  return next;
end;
$$;

create or replace function public.update_roadmap_item(
  target_item_id uuid,
  expected_updated_at timestamptz,
  input_title text,
  input_description text default null,
  input_category text default 'general',
  input_priority text default 'medium',
  input_status text default 'not_started',
  input_due_date date default null,
  input_dependent_id uuid default null,
  input_assigned_to uuid default null
)
returns table(id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_permission public.household_permission;
  existing_item public.roadmap_items%rowtype;
begin
  select item.* into existing_item
  from public.roadmap_items as item
  where item.id = target_item_id
  for update;
  if not found then
    raise exception 'Roadmap item is unavailable.' using errcode = '42501';
  end if;

  current_permission := private.current_roadmap_permission(existing_item.household_id);
  if current_permission is null
    or (current_permission = 'viewer')
    or (current_permission = 'member' and existing_item.created_by <> current_user_id and existing_item.assigned_to <> current_user_id) then
    raise exception 'Roadmap item update is unavailable.' using errcode = '42501';
  end if;
  if existing_item.archived_at is not null then
    raise exception 'Archived roadmap items must be restored first.' using errcode = '22023';
  end if;
  if expected_updated_at is null or existing_item.updated_at is distinct from expected_updated_at then
    raise exception 'Roadmap item is stale.' using errcode = '40001';
  end if;
  if input_category not in ('general', 'healthcare', 'education', 'therapy', 'benefits', 'legal', 'family_support', 'other')
    or input_priority not in ('low', 'medium', 'high')
    or input_status not in ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled') then
    raise exception 'Roadmap item values are invalid.' using errcode = '22023';
  end if;
  if input_status <> existing_item.status
    and not private.roadmap_status_transition_allowed(existing_item.status, input_status) then
    raise exception 'Roadmap status transition is invalid.' using errcode = '22023';
  end if;
  if current_permission = 'member' and input_assigned_to is not null and input_assigned_to <> current_user_id then
    raise exception 'Roadmap member assignment is invalid.' using errcode = '42501';
  end if;

  update public.roadmap_items as item
  set
    title = btrim(input_title),
    description = nullif(btrim(input_description), ''),
    category = input_category,
    priority = input_priority,
    status = input_status,
    due_date = input_due_date,
    dependent_id = input_dependent_id,
    assigned_to = input_assigned_to,
    completed_at = case
      when input_status = 'completed' then coalesce(existing_item.completed_at, now())
      else null
    end
  where item.id = existing_item.id
  returning item.id, item.updated_at into id, updated_at;

  return next;
end;
$$;

create or replace function public.archive_roadmap_item(
  target_item_id uuid,
  expected_updated_at timestamptz
)
returns table(id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_item public.roadmap_items%rowtype;
  current_permission public.household_permission;
begin
  select item.* into existing_item from public.roadmap_items as item where item.id = target_item_id for update;
  if not found then
    raise exception 'Roadmap item is unavailable.' using errcode = '42501';
  end if;
  current_permission := private.current_roadmap_permission(existing_item.household_id);
  if current_permission not in ('owner', 'administrator') then
    raise exception 'Roadmap archive is unavailable.' using errcode = '42501';
  end if;
  if existing_item.archived_at is not null then
    return query select existing_item.id, existing_item.updated_at;
    return;
  end if;
  if expected_updated_at is null or existing_item.updated_at is distinct from expected_updated_at then
    raise exception 'Roadmap item is stale.' using errcode = '40001';
  end if;
  update public.roadmap_items as item
  set archived_at = now()
  where item.id = existing_item.id
  returning item.id, item.updated_at into id, updated_at;
  return next;
end;
$$;

create or replace function public.restore_roadmap_item(
  target_item_id uuid,
  expected_updated_at timestamptz
)
returns table(id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_item public.roadmap_items%rowtype;
  current_permission public.household_permission;
begin
  select item.* into existing_item from public.roadmap_items as item where item.id = target_item_id for update;
  if not found then
    raise exception 'Roadmap item is unavailable.' using errcode = '42501';
  end if;
  current_permission := private.current_roadmap_permission(existing_item.household_id);
  if current_permission not in ('owner', 'administrator') then
    raise exception 'Roadmap restore is unavailable.' using errcode = '42501';
  end if;
  if existing_item.archived_at is null then
    return query select existing_item.id, existing_item.updated_at;
    return;
  end if;
  if expected_updated_at is null or existing_item.updated_at is distinct from expected_updated_at then
    raise exception 'Roadmap item is stale.' using errcode = '40001';
  end if;
  update public.roadmap_items as item
  set archived_at = null
  where item.id = existing_item.id
  returning item.id, item.updated_at into id, updated_at;
  return next;
end;
$$;

create or replace function public.reorder_roadmap_items(
  target_item_id uuid,
  expected_updated_at timestamptz,
  input_direction text
)
returns table(id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_item public.roadmap_items%rowtype;
  adjacent_item public.roadmap_items%rowtype;
  current_permission public.household_permission;
begin
  if input_direction not in ('up', 'down') then
    raise exception 'Roadmap reorder direction is invalid.' using errcode = '22023';
  end if;
  select item.* into current_item from public.roadmap_items as item where item.id = target_item_id for update;
  if not found then
    raise exception 'Roadmap item is unavailable.' using errcode = '42501';
  end if;
  current_permission := private.current_roadmap_permission(current_item.household_id);
  if current_permission not in ('owner', 'administrator') then
    raise exception 'Roadmap reorder is unavailable.' using errcode = '42501';
  end if;
  if current_item.archived_at is not null then
    raise exception 'Archived roadmap items cannot be reordered.' using errcode = '22023';
  end if;
  if expected_updated_at is null or current_item.updated_at is distinct from expected_updated_at then
    raise exception 'Roadmap item is stale.' using errcode = '40001';
  end if;

  if input_direction = 'up' then
    select item.* into adjacent_item
    from public.roadmap_items as item
    where item.household_id = current_item.household_id
      and item.archived_at is null
      and (item.sort_order, item.id) < (current_item.sort_order, current_item.id)
    order by item.sort_order desc, item.id desc
    limit 1
    for update;
  else
    select item.* into adjacent_item
    from public.roadmap_items as item
    where item.household_id = current_item.household_id
      and item.archived_at is null
      and (item.sort_order, item.id) > (current_item.sort_order, current_item.id)
    order by item.sort_order asc, item.id asc
    limit 1
    for update;
  end if;

  if found then
    update public.roadmap_items as item
    set sort_order = current_item.sort_order
    where item.id = adjacent_item.id;
    update public.roadmap_items as item
    set sort_order = adjacent_item.sort_order
    where item.id = current_item.id
    returning item.id, item.updated_at into id, updated_at;
  else
    id := current_item.id;
    updated_at := current_item.updated_at;
  end if;
  return next;
end;
$$;

revoke all on function private.roadmap_item_integrity() from public, anon, authenticated;
revoke all on function private.current_roadmap_permission(uuid) from public, anon;
revoke all on function private.roadmap_status_transition_allowed(text, text) from public, anon;
revoke all on function public.list_roadmap_assignable_members() from public, anon;
revoke all on function public.list_roadmap_items(boolean, text, text, text, text, uuid, boolean, boolean, text, integer, uuid) from public, anon;
revoke all on function public.create_roadmap_item(text, text, text, text, text, date, uuid, uuid, uuid) from public, anon;
revoke all on function public.update_roadmap_item(uuid, timestamptz, text, text, text, text, text, date, uuid, uuid) from public, anon;
revoke all on function public.archive_roadmap_item(uuid, timestamptz) from public, anon;
revoke all on function public.restore_roadmap_item(uuid, timestamptz) from public, anon;
revoke all on function public.reorder_roadmap_items(uuid, timestamptz, text) from public, anon;
grant execute on function public.list_roadmap_assignable_members() to authenticated;
grant execute on function public.list_roadmap_items(boolean, text, text, text, text, uuid, boolean, boolean, text, integer, uuid) to authenticated;
grant execute on function public.create_roadmap_item(text, text, text, text, text, date, uuid, uuid, uuid) to authenticated;
grant execute on function public.update_roadmap_item(uuid, timestamptz, text, text, text, text, text, date, uuid, uuid) to authenticated;
grant execute on function public.archive_roadmap_item(uuid, timestamptz) to authenticated;
grant execute on function public.restore_roadmap_item(uuid, timestamptz) to authenticated;
grant execute on function public.reorder_roadmap_items(uuid, timestamptz, text) to authenticated;
