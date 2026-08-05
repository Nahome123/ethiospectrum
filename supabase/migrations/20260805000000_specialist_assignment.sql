-- ETH-026: request-level specialist assignment.
--
-- ETH-025 shipped support requests with every specialist path denied. ETH-026
-- adds the deliberate grant: a platform administrator assigns one eligible
-- specialist to one open support request, and that assignment is the entire
-- authorization boundary. Access is checked against live database state on
-- every query, so revocation is immediate even for an existing browser session.
--
-- household_specialists stays dormant: it is neither populated nor consulted,
-- and can_access_household() is deliberately not the ETH-026 boundary because
-- it grants household-wide access this issue must not create.

-- 1. Request-level assignment metadata on the existing support_threads table.

alter table public.support_threads
  add column if not exists specialist_assigned_at timestamptz,
  add column if not exists specialist_assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists assignment_version integer not null default 0,
  add column if not exists assignment_updated_at timestamptz;

alter table public.support_threads
  drop constraint if exists support_threads_assignment_valid,
  drop constraint if exists support_threads_assignment_version_valid;

alter table public.support_threads
  add constraint support_threads_assignment_valid check (
    (specialist_id is null and specialist_assigned_at is null and specialist_assigned_by is null)
    or (specialist_id is not null and specialist_assigned_at is not null and specialist_assigned_by is not null)
  ),
  add constraint support_threads_assignment_version_valid check (assignment_version >= 0);

-- An active assignment only ever exists on an open request; the workload index
-- matches exactly the rows a specialist may read.
create index if not exists support_threads_assigned_specialist_idx
  on public.support_threads (specialist_id, updated_at desc, id)
  where specialist_id is not null and status = 'open';

-- 2. Server-controlled message authorship.

alter table public.support_messages
  add column if not exists author_kind text not null default 'caregiver';

update public.support_messages
set author_kind = 'caregiver'
where author_kind is null or author_kind not in ('caregiver', 'specialist');

alter table public.support_messages
  drop constraint if exists support_messages_author_kind_valid;

alter table public.support_messages
  add constraint support_messages_author_kind_valid check (author_kind in ('caregiver', 'specialist'));

-- 3. Immutable assignment audit history.

create table if not exists public.support_request_assignment_events (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  specialist_id uuid not null references public.specialists(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('assigned', 'revoked')),
  assignment_version integer not null check (assignment_version >= 1),
  reason text check (
    reason is null
    or reason in ('administrator_revoked', 'request_closed', 'request_cancelled')
  ),
  safe_metadata jsonb check (safe_metadata is null or pg_column_size(safe_metadata) <= 512),
  created_at timestamptz not null default now()
);

create index if not exists support_request_assignment_events_thread_idx
  on public.support_request_assignment_events (thread_id, created_at, id);
create index if not exists support_request_assignment_events_specialist_idx
  on public.support_request_assignment_events (specialist_id, created_at desc);

-- 4. A private transaction marker keeps assignment fields unwritable outside
-- the reviewed controlled functions, even for an elevated connection.

create table if not exists private.support_assignment_markers (
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  transaction_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (thread_id, transaction_id)
);

create or replace function private.has_support_assignment_marker(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.support_assignment_markers as marker
    where marker.thread_id = target_thread_id
      and marker.transaction_id = txid_current()
  );
$$;

-- 5. Integrity triggers: ETH-025 rules preserved, assignment changes allowed
-- only behind the marker.

create or replace function private.support_thread_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_changed boolean;
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

    assignment_changed :=
      new.specialist_id is distinct from old.specialist_id
      or new.specialist_assigned_at is distinct from old.specialist_assigned_at
      or new.specialist_assigned_by is distinct from old.specialist_assigned_by
      or new.assignment_version is distinct from old.assignment_version
      or new.assignment_updated_at is distinct from old.assignment_updated_at;

    if assignment_changed then
      if not private.has_support_assignment_marker(new.id) then
        raise exception 'Specialist assignment is controlled.' using errcode = '42501';
      end if;
      if new.assignment_version not in (old.assignment_version, old.assignment_version + 1) then
        raise exception 'Specialist assignment version is controlled.' using errcode = '42501';
      end if;
    end if;
  elsif new.specialist_id is not null then
    -- A request is never created with an assignment; ETH-026 assigns later.
    raise exception 'Specialist assignment is controlled.' using errcode = '42501';
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
  -- Author kind is derived by the controlled functions; a specialist message
  -- requires that the sender is the request's active specialist right now.
  if new.author_kind = 'specialist' and not exists (
    select 1
    from public.support_threads as thread
    join public.specialists as specialist on specialist.id = thread.specialist_id
    where thread.id = new.support_thread_id
      and thread.status = 'open'
      and specialist.user_id = new.sender_id
  ) then
    raise exception 'Specialist message authorship is invalid.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists support_messages_validate_integrity on public.support_messages;
create trigger support_messages_validate_integrity
  before insert or update on public.support_messages
  for each row execute function private.support_message_integrity();

create or replace function private.support_assignment_event_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Specialist assignment events are immutable.' using errcode = '42501';
end;
$$;

drop trigger if exists support_request_assignment_events_immutable on public.support_request_assignment_events;
create trigger support_request_assignment_events_immutable
  before update on public.support_request_assignment_events
  for each row execute function private.support_assignment_event_immutable();

-- 6. The ETH-026 authorization boundary. Deliberately request-scoped: it never
-- consults household membership, household_specialists, or can_access_household.

create or replace function private.current_specialist_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select specialist.id
  from public.specialists as specialist
  join public.user_roles as app_role on app_role.user_id = specialist.user_id
  where specialist.user_id = auth.uid()
    and app_role.role = 'specialist'::public.app_role
  limit 1;
$$;

create or replace function private.is_assigned_open_request_specialist(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.support_threads as thread
    join public.specialists as specialist on specialist.id = thread.specialist_id
    join public.user_roles as app_role on app_role.user_id = specialist.user_id
    where thread.id = target_thread_id
      and thread.status = 'open'
      and thread.specialist_id is not null
      and specialist.user_id = auth.uid()
      and app_role.role = 'specialist'::public.app_role
  );
$$;

create or replace function private.is_eligible_specialist(target_specialist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.specialists as specialist
    join public.user_roles as app_role on app_role.user_id = specialist.user_id
    join public.profiles as profile on profile.id = specialist.user_id
    where specialist.id = target_specialist_id
      and app_role.role = 'specialist'::public.app_role
      and specialist.availability_status = 'available'
  );
$$;

-- 7. RLS: ETH-025 household access preserved, request-specific specialist reads
-- added, assignment history restricted to platform administrators.

alter table public.support_request_assignment_events enable row level security;
alter table public.support_request_assignment_events force row level security;

drop policy if exists support_threads_assigned_specialist_read on public.support_threads;
create policy support_threads_assigned_specialist_read
  on public.support_threads
  for select to authenticated
  using (private.is_assigned_open_request_specialist(id));

drop policy if exists support_messages_assigned_specialist_read on public.support_messages;
create policy support_messages_assigned_specialist_read
  on public.support_messages
  for select to authenticated
  using (private.is_assigned_open_request_specialist(support_thread_id));

drop policy if exists support_request_assignment_events_administrator_read
  on public.support_request_assignment_events;
create policy support_request_assignment_events_administrator_read
  on public.support_request_assignment_events
  for select to authenticated
  using (private.is_current_user_administrator());

revoke all on table public.support_request_assignment_events from anon;
revoke all on table public.support_request_assignment_events from authenticated;
grant select on table public.support_request_assignment_events to authenticated;

-- 8. Controlled assignment operations.

create or replace function public.assign_specialist_to_support_request(
  target_thread_id uuid,
  target_specialist_id uuid,
  expected_assignment_version integer
)
returns table(id uuid, assignment_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_thread public.support_threads%rowtype;
  next_version integer;
begin
  if not private.is_current_user_administrator() then
    raise exception 'Specialist assignment is unavailable.' using errcode = '42501';
  end if;

  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = target_thread_id
  for update;
  if not found then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;
  if existing_thread.status <> 'open' then
    raise exception 'A closed or cancelled support request cannot be assigned.' using errcode = '55000';
  end if;
  -- Version before duplicate detection, so a concurrent assignment reports the
  -- stale state the caller must refresh rather than a bare conflict.
  if expected_assignment_version is null
    or existing_thread.assignment_version is distinct from expected_assignment_version then
    raise exception 'This specialist assignment was updated elsewhere.' using errcode = '40001';
  end if;
  if existing_thread.specialist_id is not null then
    raise exception 'This support request already has an assigned specialist.' using errcode = '23505';
  end if;
  if target_specialist_id is null or not private.is_eligible_specialist(target_specialist_id) then
    raise exception 'This specialist cannot be assigned.' using errcode = '22023';
  end if;

  next_version := existing_thread.assignment_version + 1;

  insert into private.support_assignment_markers (thread_id, transaction_id)
  values (existing_thread.id, txid_current())
  on conflict do nothing;

  update public.support_threads as thread
  set
    specialist_id = target_specialist_id,
    specialist_assigned_at = now(),
    specialist_assigned_by = current_user_id,
    assignment_version = next_version,
    assignment_updated_at = now()
  where thread.id = existing_thread.id;

  delete from private.support_assignment_markers as marker
  where marker.thread_id = existing_thread.id and marker.transaction_id = txid_current();

  insert into public.support_request_assignment_events (
    thread_id, household_id, specialist_id, actor_user_id, action, assignment_version, reason, safe_metadata
  ) values (
    existing_thread.id, existing_thread.household_id, target_specialist_id, current_user_id,
    'assigned', next_version, null,
    jsonb_build_object('category', existing_thread.category, 'preferred_language', existing_thread.preferred_language)
  );

  return query select existing_thread.id, next_version;
end;
$$;

create or replace function private.revoke_support_request_specialist(
  existing_thread public.support_threads,
  actor_user_id uuid,
  revocation_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer := existing_thread.assignment_version + 1;
begin
  insert into private.support_assignment_markers (thread_id, transaction_id)
  values (existing_thread.id, txid_current())
  on conflict do nothing;

  update public.support_threads as thread
  set
    specialist_id = null,
    specialist_assigned_at = null,
    specialist_assigned_by = null,
    assignment_version = next_version,
    assignment_updated_at = now()
  where thread.id = existing_thread.id;

  delete from private.support_assignment_markers as marker
  where marker.thread_id = existing_thread.id and marker.transaction_id = txid_current();

  insert into public.support_request_assignment_events (
    thread_id, household_id, specialist_id, actor_user_id, action, assignment_version, reason
  ) values (
    existing_thread.id, existing_thread.household_id, existing_thread.specialist_id, actor_user_id,
    'revoked', next_version, revocation_reason
  );

  return next_version;
end;
$$;

create or replace function public.revoke_specialist_from_support_request(
  target_thread_id uuid,
  expected_assignment_version integer
)
returns table(id uuid, assignment_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_thread public.support_threads%rowtype;
  next_version integer;
begin
  if not private.is_current_user_administrator() then
    raise exception 'Specialist revocation is unavailable.' using errcode = '42501';
  end if;

  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = target_thread_id
  for update;
  if not found then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;
  -- Version first: a mismatch means the assignment changed under this caller
  -- (another revocation, or an automatic revocation on close), which is the
  -- stale case rather than a request that never had a specialist.
  if expected_assignment_version is null
    or existing_thread.assignment_version is distinct from expected_assignment_version then
    raise exception 'This specialist assignment was updated elsewhere.' using errcode = '40001';
  end if;
  if existing_thread.specialist_id is null then
    raise exception 'This support request has no assigned specialist.' using errcode = '55000';
  end if;

  next_version := private.revoke_support_request_specialist(
    existing_thread, auth.uid(), 'administrator_revoked'
  );
  return query select existing_thread.id, next_version;
end;
$$;

-- 9. ETH-025 close and cancel now revoke an active assignment atomically.

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

  -- A terminal request never keeps an active specialist; clear it in the same
  -- statement so specialist access ends the moment the status changes.
  if existing_thread.specialist_id is not null then
    insert into private.support_assignment_markers (thread_id, transaction_id)
    values (existing_thread.id, txid_current())
    on conflict do nothing;
  end if;

  update public.support_threads as thread
  set
    status = next_status,
    version = existing_thread.version + 1,
    closed_by = case when next_status = 'closed' then current_user_id else null end,
    closed_at = case when next_status = 'closed' then now() else null end,
    cancelled_by = case when next_status = 'cancelled' then current_user_id else null end,
    cancelled_at = case when next_status = 'cancelled' then now() else null end,
    specialist_id = null,
    specialist_assigned_at = null,
    specialist_assigned_by = null,
    assignment_version = case
      when existing_thread.specialist_id is not null then existing_thread.assignment_version + 1
      else existing_thread.assignment_version
    end,
    assignment_updated_at = case
      when existing_thread.specialist_id is not null then now()
      else existing_thread.assignment_updated_at
    end
  where thread.id = existing_thread.id
  returning thread.id, thread.version into id, version;

  if existing_thread.specialist_id is not null then
    delete from private.support_assignment_markers as marker
    where marker.thread_id = existing_thread.id and marker.transaction_id = txid_current();

    insert into public.support_request_assignment_events (
      thread_id, household_id, specialist_id, actor_user_id, action, assignment_version, reason
    ) values (
      existing_thread.id, existing_thread.household_id, existing_thread.specialist_id, current_user_id,
      'revoked', existing_thread.assignment_version + 1,
      case when next_status = 'closed' then 'request_closed' else 'request_cancelled' end
    );
  end if;

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

-- 10. Specialist responses reuse the ETH-025 message log and its caps.

create or replace function public.add_specialist_support_message(
  target_thread_id uuid,
  input_body text,
  input_idempotency_key uuid
)
returns table(id uuid, assignment_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_specialist_id uuid;
  normalized_body text := btrim(coalesce(input_body, ''));
  existing_thread public.support_threads%rowtype;
  existing_message public.support_messages%rowtype;
  thread_message_count integer;
  created_message_id uuid;
begin
  current_specialist_id := private.current_specialist_profile_id();
  if current_specialist_id is null then
    raise exception 'Specialist responses are unavailable.' using errcode = '42501';
  end if;

  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = target_thread_id
  for update;
  if not found or existing_thread.specialist_id is distinct from current_specialist_id then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;
  if existing_thread.status <> 'open' then
    raise exception 'This support request no longer accepts messages.' using errcode = '55000';
  end if;
  if input_idempotency_key is null then
    raise exception 'Support message creation key is required.' using errcode = '22023';
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
    return query select existing_message.id, existing_thread.assignment_version;
    return;
  end if;

  select count(*) into thread_message_count
  from public.support_messages as message
  where message.support_thread_id = existing_thread.id;
  if thread_message_count >= 50 then
    raise exception 'The support request message limit was reached.' using errcode = '54000';
  end if;

  insert into public.support_messages (
    support_thread_id, household_id, sender_id, content, idempotency_key, author_kind
  ) values (
    existing_thread.id, existing_thread.household_id, current_user_id, normalized_body,
    input_idempotency_key, 'specialist'
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
    jsonb_build_object('message_sequence', thread_message_count + 1, 'author_kind', 'specialist')
  );

  return query select created_message_id, existing_thread.assignment_version;
end;
$$;

-- 11. Safe read payloads.

create or replace function public.list_assignable_specialists()
returns table(
  id uuid,
  display_name text,
  languages text[],
  specialties text[],
  availability_status text,
  active_assignment_count bigint,
  is_eligible boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_current_user_administrator() then
    raise exception 'The specialist directory is unavailable.' using errcode = '42501';
  end if;

  return query
  select
    specialist.id,
    coalesce(
      nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      'Ethiospectrum specialist'
    ) as display_name,
    specialist.languages,
    specialist.specialties,
    specialist.availability_status,
    (
      select count(*)
      from public.support_threads as thread
      where thread.specialist_id = specialist.id and thread.status = 'open'
    ) as active_assignment_count,
    (app_role.role = 'specialist'::public.app_role and specialist.availability_status = 'available')
      as is_eligible
  from public.specialists as specialist
  join public.user_roles as app_role on app_role.user_id = specialist.user_id
  left join public.profiles as profile on profile.id = specialist.user_id
  where app_role.role = 'specialist'::public.app_role
  order by display_name, specialist.id
  limit 100;
end;
$$;

create or replace function public.get_support_request_assignment(target_thread_id uuid)
returns table(
  thread_id uuid,
  specialist_id uuid,
  specialist_name text,
  assignment_version integer,
  specialist_assigned_at timestamptz,
  status text,
  can_assign boolean,
  can_revoke boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_thread public.support_threads%rowtype;
begin
  if not private.is_current_user_administrator() then
    raise exception 'Specialist assignment is unavailable.' using errcode = '42501';
  end if;
  select thread.* into existing_thread
  from public.support_threads as thread
  where thread.id = target_thread_id;
  if not found then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;

  return query
  select
    thread.id,
    thread.specialist_id,
    case
      when thread.specialist_id is null then null
      else coalesce(
        nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
        'Ethiospectrum specialist'
      )
    end,
    thread.assignment_version,
    thread.specialist_assigned_at,
    thread.status,
    (thread.status = 'open' and thread.specialist_id is null),
    (thread.status = 'open' and thread.specialist_id is not null)
  from public.support_threads as thread
  left join public.specialists as specialist on specialist.id = thread.specialist_id
  left join public.profiles as profile on profile.id = specialist.user_id
  where thread.id = existing_thread.id;
end;
$$;

create or replace function public.list_support_request_assignment_events(target_thread_id uuid)
returns table(
  id uuid,
  action text,
  specialist_name text,
  assignment_version integer,
  reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_current_user_administrator() then
    raise exception 'Assignment history is unavailable.' using errcode = '42501';
  end if;

  return query
  select
    event.id,
    event.action,
    coalesce(
      nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      'Ethiospectrum specialist'
    ),
    event.assignment_version,
    event.reason,
    event.created_at
  from public.support_request_assignment_events as event
  left join public.specialists as specialist on specialist.id = event.specialist_id
  left join public.profiles as profile on profile.id = specialist.user_id
  where event.thread_id = target_thread_id
  order by event.created_at desc, event.id desc
  limit 50;
end;
$$;

create or replace function public.list_specialist_support_requests(input_page integer default 1)
returns table(
  id uuid,
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
  current_specialist_id uuid;
  page_offset integer;
begin
  current_specialist_id := private.current_specialist_profile_id();
  if current_specialist_id is null then
    raise exception 'Assigned support requests are unavailable.' using errcode = '42501';
  end if;
  if input_page < 1 or input_page > 100000 then
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
    thread.created_at,
    thread.updated_at,
    (
      select count(*)
      from public.support_messages as message
      where message.support_thread_id = thread.id
    ),
    count(*) over ()
  from public.support_threads as thread
  where thread.specialist_id = current_specialist_id
    and thread.status = 'open'
  order by thread.updated_at desc, thread.id
  limit 10 offset page_offset;
end;
$$;

create or replace function public.get_specialist_support_request(target_thread_id uuid)
returns table(
  id uuid,
  subject text,
  category text,
  preferred_language text,
  status text,
  created_at timestamptz,
  last_activity_at timestamptz,
  requester_name text,
  message_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_specialist_id uuid;
begin
  current_specialist_id := private.current_specialist_profile_id();
  if current_specialist_id is null then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;

  return query
  select
    thread.id,
    thread.subject,
    thread.category,
    thread.preferred_language,
    thread.status,
    thread.created_at,
    thread.updated_at,
    coalesce(
      nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      'Household member'
    ),
    (
      select count(*)
      from public.support_messages as message
      where message.support_thread_id = thread.id
    )
  from public.support_threads as thread
  left join public.profiles as profile on profile.id = thread.created_by
  where thread.id = target_thread_id
    and thread.specialist_id = current_specialist_id
    and thread.status = 'open';
end;
$$;

-- 12. ETH-025 read payloads gain safe assignment and authorship fields. Their
-- result shapes change, so the previous definitions are dropped first.

drop function if exists public.list_support_requests(text, text, integer, uuid);
drop function if exists public.get_support_request_messages(uuid);
drop function if exists public.list_support_requests_admin(text, text, integer, uuid);

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
  assigned_specialist_name text,
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
    case
      when thread.specialist_id is null then null
      else coalesce(
        nullif(btrim(concat_ws(' ', specialist_profile.first_name, specialist_profile.last_name)), ''),
        'Ethiospectrum specialist'
      )
    end as assigned_specialist_name,
    count(*) over () as total_count
  from public.support_threads as thread
  left join public.profiles as requester_profile on requester_profile.id = thread.created_by
  left join public.specialists as specialist on specialist.id = thread.specialist_id
  left join public.profiles as specialist_profile on specialist_profile.id = specialist.user_id
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
  author_kind text,
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
      or private.is_assigned_open_request_specialist(existing_thread.id)
    ) then
    raise exception 'This support request is unavailable.' using errcode = '42501';
  end if;

  return query
  select
    message.id,
    message.content as body,
    message.created_at,
    case
      when message.author_kind = 'specialist' then coalesce(
        nullif(btrim(concat_ws(' ', author_profile.first_name, author_profile.last_name)), ''),
        'Ethiospectrum specialist'
      )
      else coalesce(
        nullif(btrim(concat_ws(' ', author_profile.first_name, author_profile.last_name)), ''),
        'Household member'
      )
    end as author_name,
    message.author_kind,
    message.sender_id = current_user_id as author_is_self,
    (
      message.author_kind = 'caregiver'
      and not exists (
        select 1
        from public.household_members as membership
        where membership.household_id = existing_thread.household_id
          and membership.user_id = message.sender_id
          and membership.status = 'active'
      )
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
  assigned_specialist_name text,
  assignment_version integer,
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
    case
      when thread.specialist_id is null then null
      else coalesce(
        nullif(btrim(concat_ws(' ', specialist_profile.first_name, specialist_profile.last_name)), ''),
        'Ethiospectrum specialist'
      )
    end as assigned_specialist_name,
    thread.assignment_version,
    count(*) over () as total_count
  from public.support_threads as thread
  join public.households as household on household.id = thread.household_id
  left join public.specialists as specialist on specialist.id = thread.specialist_id
  left join public.profiles as specialist_profile on specialist_profile.id = specialist.user_id
  where (input_request_id is null or thread.id = input_request_id)
    and (input_status is null or thread.status = input_status)
    and (input_category is null or thread.category = input_category)
  order by thread.updated_at desc, thread.id
  limit 10 offset page_offset;
end;
$$;

-- 13. Narrow grants. Anonymous callers receive nothing; the private helpers and
-- the marker table stay out of reach of every browser role.

revoke all on table private.support_assignment_markers from public, anon, authenticated;
revoke all on function private.has_support_assignment_marker(uuid) from public, anon, authenticated;
revoke all on function private.support_assignment_event_immutable() from public, anon, authenticated;
revoke all on function private.revoke_support_request_specialist(public.support_threads, uuid, text)
  from public, anon, authenticated;
revoke all on function private.current_specialist_profile_id() from public, anon;
revoke all on function private.is_assigned_open_request_specialist(uuid) from public, anon;
revoke all on function private.is_eligible_specialist(uuid) from public, anon;
grant execute on function private.current_specialist_profile_id() to authenticated;
grant execute on function private.is_assigned_open_request_specialist(uuid) to authenticated;

revoke all on function public.assign_specialist_to_support_request(uuid, uuid, integer) from public, anon;
revoke all on function public.revoke_specialist_from_support_request(uuid, integer) from public, anon;
revoke all on function public.add_specialist_support_message(uuid, text, uuid) from public, anon;
revoke all on function public.list_assignable_specialists() from public, anon;
revoke all on function public.get_support_request_assignment(uuid) from public, anon;
revoke all on function public.list_support_request_assignment_events(uuid) from public, anon;
revoke all on function public.list_specialist_support_requests(integer) from public, anon;
revoke all on function public.get_specialist_support_request(uuid) from public, anon;
grant execute on function public.assign_specialist_to_support_request(uuid, uuid, integer) to authenticated;
grant execute on function public.revoke_specialist_from_support_request(uuid, integer) to authenticated;
grant execute on function public.add_specialist_support_message(uuid, text, uuid) to authenticated;
grant execute on function public.list_assignable_specialists() to authenticated;
grant execute on function public.get_support_request_assignment(uuid) to authenticated;
grant execute on function public.list_support_request_assignment_events(uuid) to authenticated;
grant execute on function public.list_specialist_support_requests(integer) to authenticated;
grant execute on function public.get_specialist_support_request(uuid) to authenticated;
