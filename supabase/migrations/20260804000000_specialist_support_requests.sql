-- ETH-025: household specialist support requests.
--
-- The foundation shipped dormant support_threads and support_messages tables
-- whose read policies flowed through can_access_household(), which also grants
-- assigned specialists. ETH-025 turns those tables into a caregiver-only,
-- household-shared request workflow with an append-only message log, a
-- controlled open/closed/cancelled lifecycle, an immutable audit table, and a
-- platform-administrator read-only triage path. Specialist access of any kind
-- remains excluded until ETH-026 grants it deliberately.

-- 1. Extend support_threads with the ETH-025 request model.

alter table public.support_threads
  add column if not exists created_by uuid references auth.users(id) on delete restrict,
  add column if not exists subject text,
  add column if not exists category text,
  add column if not exists preferred_language text,
  add column if not exists expectations_acknowledged_at timestamptz,
  add column if not exists expectations_copy_version text,
  add column if not exists version integer,
  add column if not exists closed_by uuid references auth.users(id) on delete set null,
  add column if not exists closed_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists idempotency_key uuid;

-- Any pre-ETH-025 draft row is backfilled fail-safe rather than trusted as an
-- acknowledged request; local environments have no such rows after a reset.
update public.support_threads
set
  created_by = coalesce(created_by, (
    select household.primary_owner_id
    from public.households as household
    where household.id = household_id
  )),
  subject = coalesce(subject, 'Support request'),
  category = coalesce(category, 'general'),
  preferred_language = coalesce(preferred_language, 'en'),
  expectations_acknowledged_at = coalesce(expectations_acknowledged_at, created_at),
  expectations_copy_version = coalesce(expectations_copy_version, 'pre-eth-025'),
  version = coalesce(version, 1),
  closed_by = case when status = 'closed' then coalesce(closed_by, created_by) else closed_by end,
  closed_at = case when status = 'closed' then coalesce(closed_at, updated_at) else closed_at end;

alter table public.support_threads
  alter column created_by set not null,
  alter column subject set not null,
  alter column category set not null,
  alter column category set default 'general',
  alter column preferred_language set not null,
  alter column preferred_language set default 'en',
  alter column expectations_acknowledged_at set not null,
  alter column expectations_copy_version set not null,
  alter column version set not null,
  alter column version set default 1;

alter table public.support_threads
  drop constraint if exists support_threads_status_check,
  drop constraint if exists support_threads_subject_valid,
  drop constraint if exists support_threads_category_valid,
  drop constraint if exists support_threads_language_valid,
  drop constraint if exists support_threads_copy_version_valid,
  drop constraint if exists support_threads_version_valid,
  drop constraint if exists support_threads_lifecycle_valid;

alter table public.support_threads
  add constraint support_threads_status_check check (status in ('open', 'closed', 'cancelled')),
  add constraint support_threads_subject_valid check (
    subject = btrim(subject) and char_length(subject) between 5 and 120
  ),
  add constraint support_threads_category_valid check (
    category in (
      'general', 'benefits', 'education', 'healthcare_navigation', 'therapy_support',
      'housing', 'transportation', 'documentation', 'other'
    )
  ),
  add constraint support_threads_language_valid check (preferred_language in ('en', 'am', 'es')),
  add constraint support_threads_copy_version_valid check (
    char_length(expectations_copy_version) between 1 and 40
  ),
  add constraint support_threads_version_valid check (version >= 1),
  add constraint support_threads_lifecycle_valid check (
    (status = 'open' and closed_at is null and closed_by is null and cancelled_at is null and cancelled_by is null)
    or (status = 'closed' and closed_at is not null and closed_by is not null and cancelled_at is null and cancelled_by is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null and closed_at is null and closed_by is null)
  );

create unique index if not exists support_threads_creation_idempotency_idx
  on public.support_threads (household_id, created_by, idempotency_key);
create index if not exists support_threads_household_activity_idx
  on public.support_threads (household_id, updated_at desc, id);
create index if not exists support_threads_household_open_idx
  on public.support_threads (household_id)
  where status = 'open';

-- 2. Extend support_messages into an immutable caregiver message log.

alter table public.support_messages
  add column if not exists household_id uuid references public.households(id) on delete cascade,
  add column if not exists idempotency_key uuid;

update public.support_messages
set
  household_id = coalesce(household_id, (
    select thread.household_id
    from public.support_threads as thread
    where thread.id = support_thread_id
  )),
  content = coalesce(nullif(btrim(content), ''), '(no content)')
where household_id is null or content <> btrim(content) or btrim(content) = '';

alter table public.support_messages
  alter column household_id set not null;

alter table public.support_messages
  drop constraint if exists support_messages_content_valid;

alter table public.support_messages
  add constraint support_messages_content_valid check (
    content = btrim(content) and char_length(content) between 1 and 3000
  );

create unique index if not exists support_messages_creation_idempotency_idx
  on public.support_messages (support_thread_id, sender_id, idempotency_key);
create index if not exists support_messages_thread_order_idx
  on public.support_messages (support_thread_id, created_at, id);

-- 3. Immutable support-request audit events.

create table if not exists public.support_request_events (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('created', 'message_added', 'closed', 'cancelled')),
  from_status text check (from_status is null or from_status in ('open', 'closed', 'cancelled')),
  to_status text check (to_status is null or to_status in ('open', 'closed', 'cancelled')),
  request_version integer not null check (request_version >= 1),
  safe_metadata jsonb check (safe_metadata is null or pg_column_size(safe_metadata) <= 512),
  created_at timestamptz not null default now()
);

create index if not exists support_request_events_thread_idx
  on public.support_request_events (thread_id, created_at, id);
create index if not exists support_request_events_household_idx
  on public.support_request_events (household_id, created_at desc);

-- 4. Integrity triggers.

create or replace function private.support_thread_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.household_id is distinct from old.household_id
      or new.created_by is distinct from old.created_by
      or new.subject is distinct from old.subject
      or new.category is distinct from old.category
      or new.preferred_language is distinct from old.preferred_language
      or new.expectations_acknowledged_at is distinct from old.expectations_acknowledged_at
      or new.expectations_copy_version is distinct from old.expectations_copy_version
      or new.idempotency_key is distinct from old.idempotency_key
      or new.created_at is distinct from old.created_at then
      raise exception 'Support request identity is immutable.' using errcode = '42501';
    end if;
    if old.status <> 'open' then
      raise exception 'A closed or cancelled support request cannot change.' using errcode = '55000';
    end if;
    if new.status is distinct from old.status and new.status not in ('closed', 'cancelled') then
      raise exception 'Support request transition is invalid.' using errcode = '22023';
    end if;
    if new.version not in (old.version, old.version + 1) then
      raise exception 'Support request version is controlled.' using errcode = '42501';
    end if;
  end if;
  -- ETH-025 never assigns a specialist; ETH-026 owns that lifecycle. A dormant
  -- legacy value may remain, but it cannot be introduced or changed here.
  if new.specialist_id is not null
    and (tg_op = 'INSERT' or new.specialist_id is distinct from old.specialist_id) then
    raise exception 'Specialist assignment is not part of this workflow.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists support_threads_validate_integrity on public.support_threads;
create trigger support_threads_validate_integrity
  before insert or update on public.support_threads
  for each row execute function private.support_thread_integrity();

create or replace function private.support_message_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_household_id uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Support messages are immutable.' using errcode = '42501';
  end if;
  select thread.household_id into parent_household_id
  from public.support_threads as thread
  where thread.id = new.support_thread_id;
  if parent_household_id is null or parent_household_id is distinct from new.household_id then
    raise exception 'Support message household is invalid.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists support_messages_validate_integrity on public.support_messages;
create trigger support_messages_validate_integrity
  before insert or update on public.support_messages
  for each row execute function private.support_message_integrity();

create or replace function private.support_event_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Support request events are immutable.' using errcode = '42501';
end;
$$;

drop trigger if exists support_request_events_immutable on public.support_request_events;
create trigger support_request_events_immutable
  before update on public.support_request_events
  for each row execute function private.support_event_immutable();

-- 5. RLS: household readers plus platform administrators only. The previous
-- policies flowed through can_access_household(), which includes assigned
-- specialists; ETH-025 replaces them so specialists are denied until ETH-026.

alter table public.support_threads enable row level security;
alter table public.support_threads force row level security;
alter table public.support_messages enable row level security;
alter table public.support_messages force row level security;
alter table public.support_request_events enable row level security;
alter table public.support_request_events force row level security;

drop policy if exists support_threads_access on public.support_threads;
drop policy if exists support_messages_access on public.support_messages;
drop policy if exists support_threads_household_read on public.support_threads;
drop policy if exists support_messages_household_read on public.support_messages;
drop policy if exists support_request_events_household_read on public.support_request_events;

create policy support_threads_household_read
  on public.support_threads
  for select to authenticated
  using (
    private.is_active_household_member(household_id)
    or private.is_current_user_administrator()
  );

create policy support_messages_household_read
  on public.support_messages
  for select to authenticated
  using (
    private.is_active_household_member(household_id)
    or private.is_current_user_administrator()
  );

create policy support_request_events_household_read
  on public.support_request_events
  for select to authenticated
  using (
    private.is_active_household_member(household_id)
    or private.is_current_user_administrator()
  );

revoke all on table public.support_threads, public.support_messages, public.support_request_events from anon;
revoke all on table public.support_threads, public.support_messages, public.support_request_events from authenticated;
grant select on table public.support_threads, public.support_messages, public.support_request_events to authenticated;

-- 6. Controlled write functions. Identity, household, role, status, version,
-- timestamps, and audit actions are derived server-side; browser payloads are
-- limited to validated content values, expected versions, and opaque
-- idempotency keys.

create or replace function private.current_support_permission(target_household_id uuid)
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

create or replace function public.create_support_request(
  input_subject text,
  input_category text,
  input_preferred_language text,
  input_description text,
  input_acknowledged boolean,
  input_idempotency_key uuid
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_household_id uuid;
  current_permission public.household_permission;
  normalized_subject text := btrim(coalesce(input_subject, ''));
  normalized_description text := btrim(coalesce(input_description, ''));
  existing_thread public.support_threads%rowtype;
  open_request_count integer;
  created_thread_id uuid;
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
    raise exception 'Support request creation is unavailable.' using errcode = '42501';
  end if;
  if input_idempotency_key is null then
    raise exception 'Support request creation key is required.' using errcode = '22023';
  end if;
  if coalesce(input_acknowledged, false) is distinct from true then
    raise exception 'Support request expectations must be acknowledged.' using errcode = '22023';
  end if;
  if char_length(normalized_subject) not between 5 and 120
    or char_length(normalized_description) not between 20 and 3000
    or input_category not in (
      'general', 'benefits', 'education', 'healthcare_navigation', 'therapy_support',
      'housing', 'transportation', 'documentation', 'other'
    )
    or input_preferred_language not in ('en', 'am', 'es') then
    raise exception 'Support request values are invalid.' using errcode = '22023';
  end if;

  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.household_id = current_household_id
    and thread.created_by = current_user_id
    and thread.idempotency_key = input_idempotency_key;
  if found then
    return query select existing_thread.id, existing_thread.version;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_household_id::text, 25025));

  select count(*) into open_request_count
  from public.support_threads as thread
  where thread.household_id = current_household_id
    and thread.status = 'open';
  if open_request_count >= 5 then
    raise exception 'The household open support request limit was reached.' using errcode = '54000';
  end if;

  insert into public.support_threads (
    household_id, created_by, subject, category, preferred_language, status,
    expectations_acknowledged_at, expectations_copy_version, version, idempotency_key
  ) values (
    current_household_id, current_user_id, normalized_subject, input_category,
    input_preferred_language, 'open', now(), 'eth-025.v1', 1, input_idempotency_key
  )
  returning public.support_threads.id into created_thread_id;

  insert into public.support_messages (support_thread_id, household_id, sender_id, content)
  values (created_thread_id, current_household_id, current_user_id, normalized_description);

  insert into public.support_request_events (
    thread_id, household_id, actor_user_id, action, from_status, to_status, request_version, safe_metadata
  ) values (
    created_thread_id, current_household_id, current_user_id, 'created', null, 'open', 1,
    jsonb_build_object('category', input_category, 'preferred_language', input_preferred_language)
  );

  return query select created_thread_id, 1;
end;
$$;

create or replace function public.add_support_request_message(
  target_thread_id uuid,
  input_body text,
  input_idempotency_key uuid
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_permission public.household_permission;
  normalized_body text := btrim(coalesce(input_body, ''));
  existing_thread public.support_threads%rowtype;
  existing_message public.support_messages%rowtype;
  thread_message_count integer;
  created_message_id uuid;
begin
  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = target_thread_id
  for update;
  if not found then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;

  current_permission := private.current_support_permission(existing_thread.household_id);
  if current_permission is null or current_permission = 'viewer' then
    raise exception 'Support request messages are unavailable.' using errcode = '42501';
  end if;
  if input_idempotency_key is null then
    raise exception 'Support message creation key is required.' using errcode = '22023';
  end if;
  if existing_thread.status <> 'open' then
    raise exception 'This support request no longer accepts messages.' using errcode = '55000';
  end if;
  if char_length(normalized_body) not between 1 and 2000 then
    raise exception 'Support message values are invalid.' using errcode = '22023';
  end if;

  select message.* into existing_message
  from public.support_messages as message
  where message.support_thread_id = existing_thread.id
    and message.sender_id = current_user_id
    and message.idempotency_key = input_idempotency_key;
  if found then
    return query select existing_message.id, existing_thread.version;
    return;
  end if;

  select count(*) into thread_message_count
  from public.support_messages as message
  where message.support_thread_id = existing_thread.id;
  if thread_message_count >= 50 then
    raise exception 'The support request message limit was reached.' using errcode = '54000';
  end if;

  insert into public.support_messages (
    support_thread_id, household_id, sender_id, content, idempotency_key
  ) values (
    existing_thread.id, existing_thread.household_id, current_user_id, normalized_body, input_idempotency_key
  )
  returning public.support_messages.id into created_message_id;

  update public.support_threads as thread
  set updated_at = now()
  where thread.id = existing_thread.id;

  insert into public.support_request_events (
    thread_id, household_id, actor_user_id, action, from_status, to_status, request_version, safe_metadata
  ) values (
    existing_thread.id, existing_thread.household_id, current_user_id, 'message_added',
    'open', 'open', existing_thread.version,
    jsonb_build_object('message_sequence', thread_message_count + 1)
  );

  return query select created_message_id, existing_thread.version;
end;
$$;

create or replace function private.transition_support_request(
  target_thread_id uuid,
  expected_version integer,
  next_status text
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_permission public.household_permission;
  existing_thread public.support_threads%rowtype;
begin
  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = target_thread_id
  for update;
  if not found then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;

  current_permission := private.current_support_permission(existing_thread.household_id);
  if current_permission is null
    or current_permission = 'viewer'
    or (current_permission = 'member' and existing_thread.created_by <> current_user_id) then
    raise exception 'This support request change is unavailable.' using errcode = '42501';
  end if;
  if existing_thread.status <> 'open' then
    raise exception 'This support request is already closed or cancelled.' using errcode = '55000';
  end if;
  if expected_version is null or existing_thread.version is distinct from expected_version then
    raise exception 'This support request was updated elsewhere.' using errcode = '40001';
  end if;

  update public.support_threads as thread
  set
    status = next_status,
    version = existing_thread.version + 1,
    closed_by = case when next_status = 'closed' then current_user_id else null end,
    closed_at = case when next_status = 'closed' then now() else null end,
    cancelled_by = case when next_status = 'cancelled' then current_user_id else null end,
    cancelled_at = case when next_status = 'cancelled' then now() else null end
  where thread.id = existing_thread.id
  returning thread.id, thread.version into id, version;

  insert into public.support_request_events (
    thread_id, household_id, actor_user_id, action, from_status, to_status, request_version
  ) values (
    existing_thread.id, existing_thread.household_id, current_user_id,
    case when next_status = 'closed' then 'closed' else 'cancelled' end,
    'open', next_status, existing_thread.version + 1
  );

  return next;
end;
$$;

create or replace function public.close_support_request(
  target_thread_id uuid,
  expected_version integer
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from private.transition_support_request(target_thread_id, expected_version, 'closed');
end;
$$;

create or replace function public.cancel_support_request(
  target_thread_id uuid,
  expected_version integer
)
returns table(id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from private.transition_support_request(target_thread_id, expected_version, 'cancelled');
end;
$$;

-- 7. Safe read functions for household and administrator payloads.

create or replace function public.list_support_requests(
  input_status text default null,
  input_category text default null,
  input_page integer default 1,
  input_request_id uuid default null
)
returns table(
  id uuid,
  subject text,
  category text,
  preferred_language text,
  status text,
  version integer,
  created_at timestamptz,
  last_activity_at timestamptz,
  message_count bigint,
  requester_name text,
  requester_is_self boolean,
  can_message boolean,
  can_close boolean,
  can_cancel boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_household_id uuid;
  current_permission public.household_permission;
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
    raise exception 'Support requests are unavailable.' using errcode = '42501';
  end if;
  if input_page < 1 or input_page > 100000
    or (input_status is not null and input_status not in ('open', 'closed', 'cancelled'))
    or (input_category is not null and input_category not in (
      'general', 'benefits', 'education', 'healthcare_navigation', 'therapy_support',
      'housing', 'transportation', 'documentation', 'other'
    )) then
    raise exception 'Support request filters are invalid.' using errcode = '22023';
  end if;

  page_offset := (input_page - 1) * 10;

  return query
  select
    thread.id,
    thread.subject,
    thread.category,
    thread.preferred_language,
    thread.status,
    thread.version,
    thread.created_at,
    thread.updated_at as last_activity_at,
    (
      select count(*)
      from public.support_messages as message
      where message.support_thread_id = thread.id
    ) as message_count,
    coalesce(
      nullif(btrim(concat_ws(' ', requester_profile.first_name, requester_profile.last_name)), ''),
      'Household member'
    ) as requester_name,
    thread.created_by = current_user_id as requester_is_self,
    (thread.status = 'open' and current_permission <> 'viewer') as can_message,
    (
      thread.status = 'open'
      and (
        current_permission in ('owner', 'administrator')
        or (current_permission = 'member' and thread.created_by = current_user_id)
      )
    ) as can_close,
    (
      thread.status = 'open'
      and (
        current_permission in ('owner', 'administrator')
        or (current_permission = 'member' and thread.created_by = current_user_id)
      )
    ) as can_cancel,
    count(*) over () as total_count
  from public.support_threads as thread
  left join public.profiles as requester_profile on requester_profile.id = thread.created_by
  where thread.household_id = current_household_id
    and (input_request_id is null or thread.id = input_request_id)
    and (input_status is null or thread.status = input_status)
    and (input_category is null or thread.category = input_category)
  order by thread.updated_at desc, thread.id
  limit 10 offset page_offset;
end;
$$;

create or replace function public.get_support_request_messages(target_thread_id uuid)
returns table(
  id uuid,
  body text,
  created_at timestamptz,
  author_name text,
  author_is_self boolean,
  author_is_former boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_thread public.support_threads%rowtype;
begin
  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = target_thread_id;
  if not found
    or not (
      private.is_active_household_member(existing_thread.household_id)
      or private.is_current_user_administrator()
    ) then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;

  return query
  select
    message.id,
    message.content as body,
    message.created_at,
    coalesce(
      nullif(btrim(concat_ws(' ', author_profile.first_name, author_profile.last_name)), ''),
      'Household member'
    ) as author_name,
    message.sender_id = current_user_id as author_is_self,
    not exists (
      select 1
      from public.household_members as membership
      where membership.household_id = existing_thread.household_id
        and membership.user_id = message.sender_id
        and membership.status = 'active'
    ) as author_is_former
  from public.support_messages as message
  left join public.profiles as author_profile on author_profile.id = message.sender_id
  where message.support_thread_id = existing_thread.id
  order by message.created_at, message.id
  limit 50;
end;
$$;

create or replace function public.list_support_requests_admin(
  input_status text default null,
  input_category text default null,
  input_page integer default 1,
  input_request_id uuid default null
)
returns table(
  id uuid,
  household_label text,
  subject text,
  category text,
  preferred_language text,
  status text,
  created_at timestamptz,
  last_activity_at timestamptz,
  message_count bigint,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  page_offset integer;
begin
  if not private.is_current_user_administrator() then
    raise exception 'Support request triage is unavailable.' using errcode = '42501';
  end if;
  if input_page < 1 or input_page > 100000
    or (input_status is not null and input_status not in ('open', 'closed', 'cancelled'))
    or (input_category is not null and input_category not in (
      'general', 'benefits', 'education', 'healthcare_navigation', 'therapy_support',
      'housing', 'transportation', 'documentation', 'other'
    )) then
    raise exception 'Support request filters are invalid.' using errcode = '22023';
  end if;

  page_offset := (input_page - 1) * 10;

  return query
  select
    thread.id,
    household.name as household_label,
    thread.subject,
    thread.category,
    thread.preferred_language,
    thread.status,
    thread.created_at,
    thread.updated_at as last_activity_at,
    (
      select count(*)
      from public.support_messages as message
      where message.support_thread_id = thread.id
    ) as message_count,
    count(*) over () as total_count
  from public.support_threads as thread
  join public.households as household on household.id = thread.household_id
  where (input_request_id is null or thread.id = input_request_id)
    and (input_status is null or thread.status = input_status)
    and (input_category is null or thread.category = input_category)
  order by thread.updated_at desc, thread.id
  limit 10 offset page_offset;
end;
$$;

-- 8. Narrow grants: authenticated users may execute the controlled functions;
-- anonymous users may not. Platform administrators receive no write function.

revoke all on function private.support_thread_integrity() from public, anon, authenticated;
revoke all on function private.support_message_integrity() from public, anon, authenticated;
revoke all on function private.support_event_immutable() from public, anon, authenticated;
revoke all on function private.current_support_permission(uuid) from public, anon;
revoke all on function private.transition_support_request(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.create_support_request(text, text, text, text, boolean, uuid) from public, anon;
revoke all on function public.add_support_request_message(uuid, text, uuid) from public, anon;
revoke all on function public.close_support_request(uuid, integer) from public, anon;
revoke all on function public.cancel_support_request(uuid, integer) from public, anon;
revoke all on function public.list_support_requests(text, text, integer, uuid) from public, anon;
revoke all on function public.get_support_request_messages(uuid) from public, anon;
revoke all on function public.list_support_requests_admin(text, text, integer, uuid) from public, anon;
grant execute on function public.create_support_request(text, text, text, text, boolean, uuid) to authenticated;
grant execute on function public.add_support_request_message(uuid, text, uuid) to authenticated;
grant execute on function public.close_support_request(uuid, integer) to authenticated;
grant execute on function public.cancel_support_request(uuid, integer) to authenticated;
grant execute on function public.list_support_requests(text, text, integer, uuid) to authenticated;
grant execute on function public.get_support_request_messages(uuid) to authenticated;
grant execute on function public.list_support_requests_admin(text, text, integer, uuid) to authenticated;
