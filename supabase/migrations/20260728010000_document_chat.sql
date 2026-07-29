-- ETH-019: persistent, household-scoped multilingual document chat.
--
-- This extends the ETH-017 one-turn queue without changing it. Conversations
-- are private to one accessible document, while every answer remains grounded
-- in the document's processed source rows. Citation presentation is deferred
-- to ETH-020; this migration persists only validated coordinates.

create table public.document_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  language text not null check (language in ('en', 'am', 'es')),
  title text not null,
  creation_idempotency_key uuid not null,
  status text not null default 'active' check (status in ('active', 'unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint document_chat_conversations_title_shape check (
    title = btrim(title) and char_length(title) between 1 and 120
  ),
  constraint document_chat_conversations_creation_idempotency_key_unique unique (
    document_id, created_by, creation_idempotency_key
  )
);

create table public.document_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.document_chat_conversations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid references public.profiles(id),
  in_reply_to_message_id uuid references public.document_chat_messages(id) on delete restrict,
  role text not null check (role in ('user', 'assistant')),
  status text not null default 'pending' check (status in ('pending', 'generating', 'completed', 'failed')),
  content text,
  result_type text check (result_type in ('grounded_answer', 'insufficient_evidence', 'outside_document', 'partial_coverage')),
  citations jsonb not null default '[]'::jsonb,
  error_code text,
  idempotency_key uuid,
  sequence_number bigint not null check (sequence_number > 0),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  source_coverage text not null default 'full' check (source_coverage in ('full', 'partial')),
  source_item_count integer not null default 0 check (source_item_count between 0 and 48),
  source_character_count integer not null default 0 check (source_character_count between 0 and 48000),
  provider text,
  model_identifier text,
  provider_call_count integer not null default 0 check (provider_call_count between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_chat_messages_sequence_unique unique (conversation_id, sequence_number),
  constraint document_chat_messages_idempotency_unique unique (conversation_id, idempotency_key),
  constraint document_chat_messages_content_shape check (
    content is null or (content = btrim(content) and char_length(content) between 1 and 1800)
  ),
  constraint document_chat_messages_citations_shape check (
    jsonb_typeof(citations) = 'array' and jsonb_array_length(citations) <= 3
  ),
  constraint document_chat_messages_lock_state check (
    (status = 'generating' and locked_at is not null and locked_by is not null)
    or (status <> 'generating' and locked_at is null and locked_by is null)
  ),
  constraint document_chat_messages_locked_by_valid check (
    locked_by is null or char_length(locked_by) between 1 and 128
  ),
  constraint document_chat_messages_safe_metadata check (
    (provider is null or (provider = btrim(provider) and char_length(provider) between 1 and 80))
    and (model_identifier is null or (model_identifier = btrim(model_identifier) and char_length(model_identifier) between 1 and 160))
    and (error_code is null or error_code in (
      'configuration_unavailable', 'provider_timeout', 'provider_unavailable',
      'provider_request_rejected', 'provider_invalid_response', 'source_validation_failed',
      'input_limit_exceeded', 'worker_timeout', 'document_unavailable', 'document_archived'
    ))
  ),
  constraint document_chat_messages_user_shape check (
    role <> 'user' or (
      created_by is not null and in_reply_to_message_id is null and status = 'completed'
      and content is not null and result_type is null and citations = '[]'::jsonb
      and error_code is null and attempt_count = 0 and locked_at is null and locked_by is null
      and started_at is null and completed_at is not null and failed_at is null
      and provider is null and model_identifier is null and provider_call_count = 0
    )
  ),
  constraint document_chat_messages_assistant_shape check (
    role <> 'assistant' or (
      created_by is null and in_reply_to_message_id is not null and idempotency_key is null
      and (
        (status in ('pending', 'generating') and content is null and result_type is null
          and citations = '[]'::jsonb and error_code is null and completed_at is null and failed_at is null
          and provider is null and model_identifier is null and provider_call_count = 0)
        or (status = 'failed' and content is null and result_type is null
          and citations = '[]'::jsonb and error_code is not null and completed_at is null and failed_at is not null
          and provider is null and model_identifier is null and provider_call_count = 0)
        or (status = 'completed' and content is not null
          and ((result_type in ('grounded_answer', 'partial_coverage') and jsonb_array_length(citations) between 1 and 3)
            or (result_type in ('insufficient_evidence', 'outside_document') and citations = '[]'::jsonb))
          and error_code is null and completed_at is not null and failed_at is null
          and provider is not null and model_identifier is not null and provider_call_count > 0)
      )
    )
  )
);

create unique index document_chat_messages_one_pending_assistant_per_conversation_idx
  on public.document_chat_messages (conversation_id)
  where role = 'assistant' and status in ('pending', 'generating');
create index document_chat_conversations_document_last_message_idx
  on public.document_chat_conversations (document_id, last_message_at desc, created_at desc);
create index document_chat_conversations_household_last_message_idx
  on public.document_chat_conversations (household_id, last_message_at desc, created_at desc);
create index document_chat_messages_conversation_sequence_idx
  on public.document_chat_messages (conversation_id, sequence_number);
create index document_chat_messages_pending_available_idx
  on public.document_chat_messages (available_at, created_at)
  where role = 'assistant' and status = 'pending';

drop trigger if exists document_chat_conversations_set_updated_at on public.document_chat_conversations;
create trigger document_chat_conversations_set_updated_at
  before update on public.document_chat_conversations
  for each row execute function private.set_updated_at();
drop trigger if exists document_chat_messages_set_updated_at on public.document_chat_messages;
create trigger document_chat_messages_set_updated_at
  before update on public.document_chat_messages
  for each row execute function private.set_updated_at();

create or replace function private.document_chat_conversation_matches_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.document_id is distinct from old.document_id
    or new.household_id is distinct from old.household_id
    or new.created_by is distinct from old.created_by
    or new.language is distinct from old.language
    or new.title is distinct from old.title
    or new.creation_idempotency_key is distinct from old.creation_idempotency_key
  ) then
    raise exception 'Document chat conversations cannot be reassigned.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.documents as document
    where document.id = new.document_id and document.household_id = new.household_id
  ) then
    raise exception 'Document chat household does not match its document.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.document_chat_message_matches_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_conversation public.document_chat_conversations%rowtype;
  replied_to public.document_chat_messages%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.conversation_id is distinct from old.conversation_id
    or new.document_id is distinct from old.document_id
    or new.household_id is distinct from old.household_id
    or new.created_by is distinct from old.created_by
    or new.in_reply_to_message_id is distinct from old.in_reply_to_message_id
    or new.role is distinct from old.role
    or new.sequence_number is distinct from old.sequence_number
    or new.idempotency_key is distinct from old.idempotency_key
  ) then
    raise exception 'Document chat messages cannot be reassigned.' using errcode = '23514';
  end if;
  select * into parent_conversation from public.document_chat_conversations as conversation
  where conversation.id = new.conversation_id;
  if not found
    or parent_conversation.document_id <> new.document_id
    or parent_conversation.household_id <> new.household_id then
    raise exception 'Document chat message does not match its conversation.' using errcode = '23514';
  end if;
  if new.role = 'user' and new.created_by is distinct from parent_conversation.created_by and auth.uid() is not null
    and new.created_by is distinct from auth.uid() then
    raise exception 'Document chat user identity is invalid.' using errcode = '42501';
  end if;
  if new.role = 'assistant' then
    select * into replied_to from public.document_chat_messages as message
    where message.id = new.in_reply_to_message_id;
    if not found or replied_to.conversation_id <> new.conversation_id
      or replied_to.role <> 'user' or replied_to.sequence_number <> new.sequence_number - 1 then
      raise exception 'Document chat assistant reply is invalid.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists document_chat_conversations_match_document on public.document_chat_conversations;
create trigger document_chat_conversations_match_document
  before insert or update on public.document_chat_conversations
  for each row execute function private.document_chat_conversation_matches_document();
drop trigger if exists document_chat_messages_match_conversation on public.document_chat_messages;
create trigger document_chat_messages_match_conversation
  before insert or update on public.document_chat_messages
  for each row execute function private.document_chat_message_matches_conversation();

create or replace function private.touch_document_chat_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.document_chat_conversations
  set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists document_chat_messages_touch_conversation on public.document_chat_messages;
create trigger document_chat_messages_touch_conversation
  after insert on public.document_chat_messages
  for each row execute function private.touch_document_chat_conversation();

create or replace function private.can_read_document_chat(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.documents as document
    where document.id = target_document_id
      and document.upload_status = 'uploaded'
      and document.processing_status = 'completed'
      and document.deleted_at is null
      and private.is_active_household_member(document.household_id)
  );
$$;

create or replace function private.cancel_document_chat_on_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.upload_status <> 'archived' and new.upload_status = 'archived' then
    update public.document_chat_conversations
    set status = 'unavailable'
    where document_id = old.id;
    update public.document_chat_messages
    set status = 'failed', locked_at = null, locked_by = null, completed_at = null,
      failed_at = now(), error_code = 'document_archived', content = null,
      result_type = null, citations = '[]'::jsonb, provider = null, model_identifier = null,
      source_item_count = 0, source_character_count = 0, provider_call_count = 0
    where document_id = old.id and role = 'assistant' and status in ('pending', 'generating');
  end if;
  return new;
end;
$$;

drop trigger if exists documents_cancel_chat_jobs_on_archive on public.documents;
create trigger documents_cancel_chat_jobs_on_archive
  after update of upload_status on public.documents
  for each row execute function private.cancel_document_chat_on_archive();

create or replace function public.create_document_chat_conversation(
  target_document_id uuid,
  requested_language text,
  initial_message_content text,
  requested_idempotency_key uuid
)
returns table (conversation_id uuid, assistant_message_id uuid, already_exists boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  target_conversation public.document_chat_conversations%rowtype;
  user_message_id uuid;
  target_sequence bigint;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if requested_language not in ('en', 'am', 'es') then raise exception 'Conversation language is invalid.' using errcode = '22023'; end if;
  if initial_message_content is null or initial_message_content <> btrim(initial_message_content)
    or char_length(initial_message_content) not between 1 and 700 then
    raise exception 'Document chat message is invalid.' using errcode = '22023';
  end if;
  if requested_idempotency_key is null then raise exception 'Document chat idempotency key is invalid.' using errcode = '22023'; end if;

  select * into target_document from public.documents as document where document.id = target_document_id for update;
  if not found or target_document.upload_status <> 'uploaded' or target_document.processing_status <> 'completed'
    or target_document.deleted_at is not null
    or not private.has_household_permission(target_document.household_id,
      array['owner', 'administrator', 'member']::public.household_permission[]) then
    raise exception 'Document chat is unavailable.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.document_chunks where document_id = target_document.id) then
    raise exception 'Document chat is unavailable.' using errcode = '22023';
  end if;

  select * into target_conversation from public.document_chat_conversations as conversation
  where conversation.document_id = target_document.id and conversation.created_by = auth.uid()
    and conversation.creation_idempotency_key = requested_idempotency_key for update;
  if found then
    select message.id into assistant_message_id from public.document_chat_messages as message
    where message.conversation_id = target_conversation.id and message.role = 'assistant'
    order by message.sequence_number asc limit 1;
    return query select target_conversation.id, assistant_message_id, true;
    return;
  end if;

  insert into public.document_chat_conversations (
    document_id, household_id, created_by, language, title, creation_idempotency_key
  ) values (
    target_document.id, target_document.household_id, auth.uid(), requested_language,
    left(initial_message_content, 120), requested_idempotency_key
  ) returning * into target_conversation;
  target_sequence := 1;
  insert into public.document_chat_messages (
    conversation_id, document_id, household_id, created_by, role, status, content,
    idempotency_key, sequence_number, completed_at
  ) values (
    target_conversation.id, target_document.id, target_document.household_id, auth.uid(), 'user', 'completed',
    initial_message_content, requested_idempotency_key, target_sequence, now()
  ) returning id into user_message_id;
  insert into public.document_chat_messages (
    conversation_id, document_id, household_id, in_reply_to_message_id, role, status, sequence_number
  ) values (
    target_conversation.id, target_document.id, target_document.household_id, user_message_id,
    'assistant', 'pending', target_sequence + 1
  ) returning id into assistant_message_id;
  return query select target_conversation.id, assistant_message_id, false;
end;
$$;

create or replace function public.send_document_chat_message(
  target_document_id uuid,
  target_conversation_id uuid,
  requested_message_content text,
  requested_idempotency_key uuid
)
returns table (assistant_message_id uuid, already_exists boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  target_conversation public.document_chat_conversations%rowtype;
  existing_user_message public.document_chat_messages%rowtype;
  new_user_message_id uuid;
  next_sequence bigint;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if requested_message_content is null or requested_message_content <> btrim(requested_message_content)
    or char_length(requested_message_content) not between 1 and 700 then
    raise exception 'Document chat message is invalid.' using errcode = '22023';
  end if;
  if requested_idempotency_key is null then raise exception 'Document chat idempotency key is invalid.' using errcode = '22023'; end if;
  select * into target_document from public.documents as document where document.id = target_document_id for update;
  if not found or target_document.upload_status <> 'uploaded' or target_document.processing_status <> 'completed'
    or target_document.deleted_at is not null or not private.has_household_permission(target_document.household_id,
      array['owner', 'administrator', 'member']::public.household_permission[]) then
    raise exception 'Document chat is unavailable.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.document_chunks where document_id = target_document.id) then
    raise exception 'Document chat is unavailable.' using errcode = '22023';
  end if;
  select * into target_conversation from public.document_chat_conversations as conversation
  where conversation.id = target_conversation_id and conversation.document_id = target_document.id
    and conversation.household_id = target_document.household_id and conversation.status = 'active' for update;
  if not found then raise exception 'Document chat is unavailable.' using errcode = '42501'; end if;
  select * into existing_user_message from public.document_chat_messages as message
  where message.conversation_id = target_conversation.id and message.idempotency_key = requested_idempotency_key for update;
  if found then
    select message.id into assistant_message_id from public.document_chat_messages as message
    where message.in_reply_to_message_id = existing_user_message.id;
    return query select assistant_message_id, true;
    return;
  end if;
  if exists (select 1 from public.document_chat_messages as message
    where message.conversation_id = target_conversation.id and message.role = 'assistant'
      and message.status in ('pending', 'generating')) then
    raise exception 'Document chat response is pending.' using errcode = '22023';
  end if;
  select coalesce(max(message.sequence_number), 0) + 1 into next_sequence
  from public.document_chat_messages as message where message.conversation_id = target_conversation.id;
  insert into public.document_chat_messages (
    conversation_id, document_id, household_id, created_by, role, status, content,
    idempotency_key, sequence_number, completed_at
  ) values (
    target_conversation.id, target_document.id, target_document.household_id, auth.uid(), 'user', 'completed',
    requested_message_content, requested_idempotency_key, next_sequence, now()
  ) returning id into new_user_message_id;
  insert into public.document_chat_messages (
    conversation_id, document_id, household_id, in_reply_to_message_id, role, status, sequence_number
  ) values (
    target_conversation.id, target_document.id, target_document.household_id, new_user_message_id,
    'assistant', 'pending', next_sequence + 1
  ) returning id into assistant_message_id;
  return query select assistant_message_id, false;
end;
$$;

create or replace function public.retry_document_chat_response(
  target_document_id uuid,
  target_conversation_id uuid,
  target_message_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  target_conversation public.document_chat_conversations%rowtype;
  target_message public.document_chat_messages%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select * into target_document from public.documents as document where document.id = target_document_id for update;
  if not found or target_document.upload_status <> 'uploaded' or target_document.processing_status <> 'completed'
    or target_document.deleted_at is not null or not private.has_household_permission(target_document.household_id,
      array['owner', 'administrator', 'member']::public.household_permission[]) then
    raise exception 'Document chat is unavailable.' using errcode = '42501';
  end if;
  select * into target_conversation from public.document_chat_conversations as conversation
  where conversation.id = target_conversation_id and conversation.document_id = target_document.id
    and conversation.household_id = target_document.household_id and conversation.status = 'active' for update;
  if not found then raise exception 'Document chat is unavailable.' using errcode = '42501'; end if;
  if exists (select 1 from public.document_chat_messages as message
    where message.conversation_id = target_conversation.id and message.role = 'assistant'
      and message.status in ('pending', 'generating')) then
    raise exception 'Document chat response is pending.' using errcode = '22023';
  end if;
  select * into target_message from public.document_chat_messages as message
  where message.id = target_message_id and message.conversation_id = target_conversation.id
    and message.role = 'assistant' for update;
  if not found or target_message.status <> 'failed' or target_message.attempt_count >= target_message.max_attempts then
    raise exception 'Document chat response cannot be retried.' using errcode = '22023';
  end if;
  update public.document_chat_messages
  set status = 'pending', available_at = now(), locked_at = null, locked_by = null,
    started_at = null, completed_at = null, failed_at = null, error_code = null,
    content = null, result_type = null, citations = '[]'::jsonb, provider = null,
    model_identifier = null, source_coverage = 'full', source_item_count = 0,
    source_character_count = 0, provider_call_count = 0
  where id = target_message.id;
  return true;
end;
$$;

create or replace function public.get_document_chat_conversations(target_document_id uuid)
returns table (
  conversation_id uuid, language text, title text, created_at timestamptz,
  last_message_at timestamptz, message_count bigint, has_pending_response boolean,
  has_failed_response boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_read_document_chat(target_document_id) then return; end if;
  return query
  select conversation.id, conversation.language, conversation.title, conversation.created_at,
    conversation.last_message_at, count(message.id),
    bool_or(message.role = 'assistant' and message.status in ('pending', 'generating')),
    bool_or(message.role = 'assistant' and message.status = 'failed')
  from public.document_chat_conversations as conversation
  left join public.document_chat_messages as message on message.conversation_id = conversation.id
  where conversation.document_id = target_document_id
  group by conversation.id
  order by conversation.last_message_at desc nulls last, conversation.created_at desc;
end;
$$;

create or replace function public.get_document_chat_conversation(
  target_document_id uuid,
  target_conversation_id uuid
)
returns table (
  conversation_id uuid, language text, title text, message_id uuid, role text, status text,
  content text, result_type text, citations jsonb, created_at timestamptz, completed_at timestamptz,
  retryable boolean, source_coverage text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_read_document_chat(target_document_id) then return; end if;
  return query
  select conversation.id, conversation.language, conversation.title, message.id, message.role, message.status,
    case when message.status = 'completed' then message.content else null end,
    case when message.status = 'completed' then message.result_type else null end,
    case when message.status = 'completed' then message.citations else '[]'::jsonb end,
    message.created_at, message.completed_at,
    message.role = 'assistant' and message.status = 'failed' and message.attempt_count < message.max_attempts,
    message.source_coverage
  from public.document_chat_conversations as conversation
  join public.document_chat_messages as message on message.conversation_id = conversation.id
  where conversation.id = target_conversation_id and conversation.document_id = target_document_id
  order by message.sequence_number asc;
end;
$$;

create or replace function public.claim_next_document_chat_message(worker_identity text)
returns table (
  message_id uuid, conversation_id uuid, document_id uuid, household_id uuid,
  language text, attempt_count integer, max_attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale record;
  claimed_message_id uuid;
  target_message public.document_chat_messages%rowtype;
  target_conversation public.document_chat_conversations%rowtype;
  target_document public.documents%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Document chat worker authorization is required.' using errcode = '42501'; end if;
  if worker_identity is null or char_length(btrim(worker_identity)) not between 1 and 128 then
    raise exception 'Worker identity is invalid.' using errcode = '22023';
  end if;
  for stale in
    select message.id from public.document_chat_messages as message
    join public.documents as document on document.id = message.document_id
    where message.role = 'assistant' and message.status = 'generating'
      and message.locked_at < now() - interval '15 minutes'
      and document.upload_status = 'uploaded' and document.processing_status = 'completed' and document.deleted_at is null
    order by message.locked_at asc limit 5 for update of message skip locked
  loop
    update public.document_chat_messages
    set status = 'failed', locked_at = null, locked_by = null, completed_at = null,
      failed_at = now(), error_code = 'worker_timeout', content = null, result_type = null,
      citations = '[]'::jsonb, provider = null, model_identifier = null,
      source_item_count = 0, source_character_count = 0, provider_call_count = 0
    where id = stale.id and status = 'generating';
  end loop;
  select message.id into claimed_message_id
  from public.document_chat_messages as message
  join public.documents as document on document.id = message.document_id
  join public.document_chat_conversations as conversation on conversation.id = message.conversation_id
  where message.role = 'assistant' and message.status = 'pending' and message.available_at <= now()
    and message.attempt_count < message.max_attempts and conversation.status = 'active'
    and document.upload_status = 'uploaded' and document.processing_status = 'completed' and document.deleted_at is null
  order by message.available_at asc, message.created_at asc limit 1 for update of message skip locked;
  if claimed_message_id is null then return; end if;
  select * into target_message from public.document_chat_messages as message where message.id = claimed_message_id for update;
  select * into target_conversation from public.document_chat_conversations as conversation where conversation.id = target_message.conversation_id;
  select * into target_document from public.documents as document where document.id = target_message.document_id;
  update public.document_chat_messages
  set status = 'generating', attempt_count = target_message.attempt_count + 1, locked_at = now(),
    locked_by = btrim(worker_identity), started_at = now(), completed_at = null, failed_at = null, error_code = null
  where id = target_message.id returning * into target_message;
  return query select target_message.id, target_conversation.id, target_document.id, target_document.household_id,
    target_conversation.language, target_message.attempt_count, target_message.max_attempts;
end;
$$;

create or replace function public.complete_document_chat_message(
  target_message_id uuid,
  expected_worker_identity text,
  completed_content text,
  completed_result_type text,
  completed_citations jsonb,
  completed_source_coverage text,
  completed_source_item_count integer,
  completed_source_character_count integer,
  completed_provider text,
  completed_model_identifier text,
  completed_provider_call_count integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_message public.document_chat_messages%rowtype;
  target_document public.documents%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Document chat worker authorization is required.' using errcode = '42501'; end if;
  select * into target_message from public.document_chat_messages as message where message.id = target_message_id for update;
  if not found or target_message.role <> 'assistant' or target_message.status <> 'generating'
    or target_message.locked_by is distinct from expected_worker_identity then return false; end if;
  select * into target_document from public.documents as document where document.id = target_message.document_id for update;
  if not found or target_document.upload_status <> 'uploaded' or target_document.processing_status <> 'completed' or target_document.deleted_at is not null then
    update public.document_chat_messages set status = 'failed', locked_at = null, locked_by = null,
      completed_at = null, failed_at = now(), error_code = 'document_unavailable', content = null,
      result_type = null, citations = '[]'::jsonb, provider = null, model_identifier = null,
      source_item_count = 0, source_character_count = 0, provider_call_count = 0 where id = target_message.id;
    return false;
  end if;
  if completed_content is null or completed_content <> btrim(completed_content)
    or char_length(completed_content) not between 1 and 1800
    or completed_result_type not in ('grounded_answer', 'insufficient_evidence', 'outside_document', 'partial_coverage')
    or coalesce(jsonb_typeof(completed_citations), '') <> 'array' or jsonb_array_length(completed_citations) > 3
    or completed_source_coverage not in ('full', 'partial') or completed_source_item_count not between 1 and 48
    or completed_source_character_count not between 1 and 48000 or completed_provider_call_count not between 1 and 2
    or completed_provider is null or completed_provider <> btrim(completed_provider) or char_length(completed_provider) not between 1 and 80
    or completed_model_identifier is null or completed_model_identifier <> btrim(completed_model_identifier)
    or char_length(completed_model_identifier) not between 1 and 160 then
    raise exception 'Document chat output is invalid.' using errcode = '22023';
  end if;
  if (completed_result_type in ('grounded_answer', 'partial_coverage') and jsonb_array_length(completed_citations) not between 1 and 3)
    or (completed_result_type in ('insufficient_evidence', 'outside_document') and completed_citations <> '[]'::jsonb) then
    raise exception 'Document chat citations are invalid.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(completed_citations) as reference_row(
      reference_id text, page_id uuid, page_number integer, chunk_id uuid, chunk_index integer
    ) where reference_id is null or reference_id !~ '^source-[1-9][0-9]*$'
      or page_id is null or page_number is null or page_number < 1
      or (chunk_id is null and chunk_index is not null)
      or (chunk_id is not null and (chunk_index is null or chunk_index < 0))
  ) or exists (
    select reference_id from jsonb_to_recordset(completed_citations) as reference_row(
      reference_id text, page_id uuid, page_number integer, chunk_id uuid, chunk_index integer
    ) group by reference_id having count(*) > 1
  ) or exists (
    select 1 from jsonb_to_recordset(completed_citations) as reference_row(
      reference_id text, page_id uuid, page_number integer, chunk_id uuid, chunk_index integer
    ) left join public.document_pages as page on page.id = reference_row.page_id
      and page.document_id = target_document.id and page.page_number = reference_row.page_number
    left join public.document_chunks as chunk on chunk.id = reference_row.chunk_id
      and chunk.document_id = target_document.id and chunk.page_id = reference_row.page_id
      and chunk.page_number = reference_row.page_number and chunk.chunk_index = reference_row.chunk_index
    where page.id is null or (reference_row.chunk_id is not null and chunk.id is null)
  ) then
    raise exception 'Document chat sources are invalid.' using errcode = '22023';
  end if;
  update public.document_chat_messages
  set status = 'completed', locked_at = null, locked_by = null, completed_at = now(), failed_at = null,
    error_code = null, content = completed_content, result_type = completed_result_type,
    citations = completed_citations, provider = completed_provider, model_identifier = completed_model_identifier,
    source_coverage = completed_source_coverage, source_item_count = completed_source_item_count,
    source_character_count = completed_source_character_count, provider_call_count = completed_provider_call_count
  where id = target_message.id;
  return true;
end;
$$;

create or replace function public.fail_document_chat_message(
  target_message_id uuid,
  expected_worker_identity text,
  safe_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_message public.document_chat_messages%rowtype;
  target_document public.documents%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Document chat worker authorization is required.' using errcode = '42501'; end if;
  if safe_error_code not in ('configuration_unavailable', 'provider_timeout', 'provider_unavailable',
    'provider_request_rejected', 'provider_invalid_response', 'source_validation_failed',
    'input_limit_exceeded', 'worker_timeout', 'document_unavailable') then
    raise exception 'Document chat failure code is invalid.' using errcode = '22023';
  end if;
  select * into target_message from public.document_chat_messages as message where message.id = target_message_id for update;
  if not found or target_message.role <> 'assistant' or target_message.status <> 'generating'
    or target_message.locked_by is distinct from expected_worker_identity then return false; end if;
  select * into target_document from public.documents as document where document.id = target_message.document_id for update;
  update public.document_chat_messages
  set status = 'failed', locked_at = null, locked_by = null, completed_at = null, failed_at = now(),
    error_code = case when not found or target_document.upload_status <> 'uploaded'
      or target_document.processing_status <> 'completed' or target_document.deleted_at is not null
      then 'document_unavailable' else safe_error_code end,
    content = null, result_type = null, citations = '[]'::jsonb, provider = null, model_identifier = null,
    source_item_count = 0, source_character_count = 0, provider_call_count = 0
  where id = target_message.id;
  return true;
end;
$$;

alter table public.document_chat_conversations enable row level security;
alter table public.document_chat_conversations force row level security;
alter table public.document_chat_messages enable row level security;
alter table public.document_chat_messages force row level security;

create policy document_chat_conversations_select_active_document_members
  on public.document_chat_conversations for select to authenticated
  using (private.can_read_document_chat(document_id));
create policy document_chat_messages_select_active_document_members
  on public.document_chat_messages for select to authenticated
  using (private.can_read_document_chat(document_id));

revoke all on table public.document_chat_conversations, public.document_chat_messages from public, anon, authenticated;
revoke all on function private.document_chat_conversation_matches_document() from public, anon, authenticated;
revoke all on function private.document_chat_message_matches_conversation() from public, anon, authenticated;
revoke all on function private.touch_document_chat_conversation() from public, anon, authenticated;
revoke all on function private.cancel_document_chat_on_archive() from public, anon, authenticated;
revoke all on function private.can_read_document_chat(uuid) from public, anon, authenticated;
grant execute on function private.can_read_document_chat(uuid) to authenticated;
revoke all on function public.create_document_chat_conversation(uuid, text, text, uuid) from public, anon;
revoke all on function public.send_document_chat_message(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.retry_document_chat_response(uuid, uuid, uuid) from public, anon;
revoke all on function public.get_document_chat_conversations(uuid) from public, anon;
revoke all on function public.get_document_chat_conversation(uuid, uuid) from public, anon;
revoke all on function public.claim_next_document_chat_message(text) from public, anon, authenticated;
revoke all on function public.complete_document_chat_message(uuid, text, text, text, jsonb, text, integer, integer, text, text, integer) from public, anon, authenticated;
revoke all on function public.fail_document_chat_message(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_document_chat_conversation(uuid, text, text, uuid) to authenticated;
grant execute on function public.send_document_chat_message(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.retry_document_chat_response(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_document_chat_conversations(uuid) to authenticated;
grant execute on function public.get_document_chat_conversation(uuid, uuid) to authenticated;
grant execute on function public.claim_next_document_chat_message(text) to service_role;
grant execute on function public.complete_document_chat_message(uuid, text, text, text, jsonb, text, integer, integer, text, text, integer) to service_role;
grant execute on function public.fail_document_chat_message(uuid, text, text) to service_role;
