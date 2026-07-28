-- ETH-017: secure, source-grounded questions and answers for one private document.
--
-- This is intentionally a bounded, document-scoped queue. It does not provide
-- conversation memory, cross-document retrieval, public sharing, or a search API.

create table public.document_questions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  language text not null check (language in ('en', 'am', 'es')),
  question text not null,
  question_normalized text not null,
  status text not null default 'queued'
    check (status in ('queued', 'answering', 'completed', 'failed')),
  answer_text text,
  source_references jsonb not null default '[]'::jsonb,
  provider text,
  model_identifier text,
  prompt_version text not null default 'document-question-v1',
  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_code text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  source_coverage text not null default 'full' check (source_coverage in ('full', 'partial')),
  source_item_count integer not null default 0 check (source_item_count between 0 and 48),
  source_character_count integer not null default 0 check (source_character_count between 0 and 48000),
  provider_call_count integer not null default 0 check (provider_call_count between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_questions_document_language_normalized_key unique (
    document_id,
    language,
    question_normalized
  ),
  constraint document_questions_attempt_limit check (attempt_count <= max_attempts),
  constraint document_questions_question_shape check (
    question = btrim(question)
    and char_length(question) between 1 and 700
    and question_normalized = lower(question)
    and char_length(question_normalized) between 1 and 700
  ),
  constraint document_questions_lock_state check (
    (status = 'answering' and locked_at is not null and locked_by is not null)
    or (status <> 'answering' and locked_at is null and locked_by is null)
  ),
  constraint document_questions_locked_by_valid check (
    locked_by is null or char_length(locked_by) between 1 and 128
  ),
  constraint document_questions_safe_metadata check (
    (provider is null or (provider = btrim(provider) and char_length(provider) between 1 and 80))
    and (model_identifier is null or (model_identifier = btrim(model_identifier) and char_length(model_identifier) between 1 and 160))
    and prompt_version = btrim(prompt_version)
    and char_length(prompt_version) between 1 and 80
    and (error_code is null or error_code in (
      'configuration_unavailable',
      'provider_timeout',
      'provider_unavailable',
      'provider_request_rejected',
      'provider_invalid_response',
      'source_validation_failed',
      'input_limit_exceeded',
      'worker_timeout',
      'document_unavailable',
      'document_archived'
    ))
  ),
  constraint document_questions_output_shape check (
    jsonb_typeof(source_references) = 'array'
    and jsonb_array_length(source_references) <= 3
    and (answer_text is null or (answer_text = btrim(answer_text) and char_length(answer_text) between 1 and 1800))
  ),
  constraint document_questions_completed_output check (
    status <> 'completed'
    or (
      answer_text is not null
      and jsonb_array_length(source_references) between 1 and 3
      and provider is not null
      and model_identifier is not null
      and completed_at is not null
      and failed_at is null
      and source_item_count > 0
      and source_character_count > 0
      and provider_call_count > 0
    )
  ),
  constraint document_questions_noncompleted_output check (
    status = 'completed'
    or (
      answer_text is null
      and source_references = '[]'::jsonb
      and completed_at is null
      and provider is null
      and model_identifier is null
      and source_item_count = 0
      and source_character_count = 0
      and provider_call_count = 0
    )
  ),
  constraint document_questions_failure_timestamp check (
    status <> 'failed' or failed_at is not null
  )
);

create index document_questions_household_status_requested_idx
  on public.document_questions (household_id, status, requested_at desc);
create index document_questions_document_requested_idx
  on public.document_questions (document_id, requested_at desc);
create index document_questions_queued_available_idx
  on public.document_questions (available_at, requested_at)
  where status = 'queued';

drop trigger if exists document_questions_set_updated_at on public.document_questions;
create trigger document_questions_set_updated_at
  before update on public.document_questions
  for each row execute function private.set_updated_at();

-- The denormalized household boundary is always derived from the parent document.
create or replace function private.document_question_matches_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.documents as document
    where document.id = new.document_id
      and document.household_id = new.household_id
  ) then
    raise exception 'Document question household does not match its document.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists document_questions_match_document on public.document_questions;
create trigger document_questions_match_document
  before insert or update of document_id, household_id on public.document_questions
  for each row execute function private.document_question_matches_document();

-- Only active members with normal access to the active, completed parent
-- document can read a question or completed answer. This is deliberately the
-- same revocable boundary as processed derivatives and summaries.
create or replace function private.can_read_document_question(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.documents as document
    where document.id = target_document_id
      and document.upload_status = 'uploaded'
      and document.processing_status = 'completed'
      and document.deleted_at is null
      and private.is_active_household_member(document.household_id)
  );
$$;

-- Archiving revokes access through RLS immediately and prevents stale workers
-- from later incurring provider work or retaining a derived answer.
create or replace function private.cancel_document_questions_on_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.upload_status <> 'archived' and new.upload_status = 'archived' then
    update public.document_questions
    set
      status = 'failed',
      locked_at = null,
      locked_by = null,
      failed_at = now(),
      error_code = 'document_archived',
      answer_text = null,
      source_references = '[]'::jsonb,
      provider = null,
      model_identifier = null,
      completed_at = null,
      source_item_count = 0,
      source_character_count = 0,
      provider_call_count = 0
    where document_id = old.id
      and status in ('queued', 'answering');
  end if;
  return new;
end;
$$;

drop trigger if exists documents_cancel_question_jobs_on_archive on public.documents;
create trigger documents_cancel_question_jobs_on_archive
  after update of upload_status on public.documents
  for each row execute function private.cancel_document_questions_on_archive();

-- The browser supplies only a target document, a controlled language, and a
-- bounded question. The database derives household, requester, eligibility,
-- idempotency, and retry state under the parent-document lock.
create or replace function public.request_document_question(
  target_document_id uuid,
  requested_language text,
  requested_question text
)
returns table (
  question_id uuid,
  question_status text,
  reused_completed boolean,
  already_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  target_question public.document_questions%rowtype;
  normalized_question text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if requested_language not in ('en', 'am', 'es') then
    raise exception 'Question language is invalid.' using errcode = '22023';
  end if;
  if requested_question is null
    or requested_question <> btrim(requested_question)
    or char_length(requested_question) not between 1 and 700 then
    raise exception 'Question is invalid.' using errcode = '22023';
  end if;
  normalized_question := lower(requested_question);

  -- All request, archive, claim, complete, and failure paths lock the parent
  -- document first. This prevents conflicting stale work and duplicate rows.
  select * into target_document
  from public.documents as document
  where document.id = target_document_id
  for update;

  if not found
    or target_document.upload_status <> 'uploaded'
    or target_document.processing_status <> 'completed'
    or target_document.deleted_at is not null
    or not private.has_household_permission(
      target_document.household_id,
      array['owner', 'administrator', 'member']::public.household_permission[]
    ) then
    raise exception 'Document question is unavailable.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.document_pages where document_id = target_document.id)
    and not exists (select 1 from public.document_chunks where document_id = target_document.id) then
    raise exception 'Document question is unavailable.' using errcode = '22023';
  end if;

  select * into target_question
  from public.document_questions as question
  where question.document_id = target_document.id
    and question.language = requested_language
    and question.question_normalized = normalized_question
  for update;

  if found and target_question.status = 'completed' then
    return query select target_question.id, target_question.status, true, false;
    return;
  end if;
  if found and target_question.status in ('queued', 'answering') then
    return query select target_question.id, target_question.status, false, true;
    return;
  end if;

  if found then
    if target_question.status <> 'failed' or target_question.attempt_count >= target_question.max_attempts then
      raise exception 'Document question cannot be retried.' using errcode = '22023';
    end if;
    update public.document_questions
    set
      status = 'queued',
      requested_by = auth.uid(),
      requested_at = now(),
      available_at = now(),
      locked_at = null,
      locked_by = null,
      started_at = null,
      completed_at = null,
      failed_at = null,
      error_code = null,
      answer_text = null,
      source_references = '[]'::jsonb,
      provider = null,
      model_identifier = null,
      source_coverage = 'full',
      source_item_count = 0,
      source_character_count = 0,
      provider_call_count = 0
    where id = target_question.id
    returning * into target_question;
  else
    insert into public.document_questions (
      document_id,
      household_id,
      language,
      question,
      question_normalized,
      status,
      requested_by
    )
    values (
      target_document.id,
      target_document.household_id,
      requested_language,
      requested_question,
      normalized_question,
      'queued',
      auth.uid()
    )
    returning * into target_question;
  end if;

  return query select target_question.id, target_question.status, false, false;
end;
$$;

-- The status RPC is deliberately narrow: provider metadata, lock ownership,
-- and internal error codes are never included in its browser-facing contract.
create or replace function public.get_document_question_status(target_question_id uuid)
returns table (
  question_id uuid,
  status text,
  retryable boolean,
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  source_coverage text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  return query
  select
    question.id,
    question.status,
    question.status = 'failed' and question.attempt_count < question.max_attempts,
    question.requested_at,
    question.started_at,
    question.completed_at,
    question.failed_at,
    question.source_coverage
  from public.document_questions as question
  where question.id = target_question_id
    and private.can_read_document_question(question.document_id);
end;
$$;

-- This is the only normal-user answer read surface. It deliberately omits row
-- IDs, requester identities, leases, attempts, provider metadata, and internal
-- failure codes; direct table selection is not granted to browser roles.
create or replace function public.get_document_questions(target_document_id uuid)
returns table (
  question text,
  language text,
  status text,
  retryable boolean,
  completed_at timestamptz,
  source_coverage text,
  answer_text text,
  source_references jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_read_document_question(target_document_id) then
    return;
  end if;
  return query
  select
    document_question.question,
    document_question.language,
    document_question.status,
    document_question.status = 'failed'
      and document_question.attempt_count < document_question.max_attempts,
    document_question.completed_at,
    document_question.source_coverage,
    case when document_question.status = 'completed' then document_question.answer_text else null end,
    case when document_question.status = 'completed' then document_question.source_references else '[]'::jsonb end
  from public.document_questions as document_question
  where document_question.document_id = target_document_id
  order by document_question.requested_at desc
  limit 5;
end;
$$;

-- Service-role-only claim. A later invocation converts stale leases to a safe
-- terminal failure before atomically claiming one due row with SKIP LOCKED.
create or replace function public.claim_next_document_question_job(worker_identity text)
returns table (
  question_id uuid,
  document_id uuid,
  household_id uuid,
  language text,
  question text,
  prompt_version text,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale record;
  claimed_document_id uuid;
  target_document public.documents%rowtype;
  target_question public.document_questions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Question worker authorization is required.' using errcode = '42501';
  end if;
  if worker_identity is null or char_length(btrim(worker_identity)) not between 1 and 128 then
    raise exception 'Worker identity is invalid.' using errcode = '22023';
  end if;

  for stale in
    select document.id as document_id, question.id as question_id
    from public.documents as document
    join public.document_questions as question on question.document_id = document.id
    where question.status = 'answering'
      and question.locked_at < now() - interval '15 minutes'
      and document.upload_status = 'uploaded'
      and document.processing_status = 'completed'
      and document.deleted_at is null
    order by question.locked_at asc
    limit 5
    for update of document skip locked
  loop
    select * into target_question
    from public.document_questions as question
    where question.id = stale.question_id
      and question.document_id = stale.document_id
      and question.status = 'answering'
      and question.locked_at < now() - interval '15 minutes'
    for update;
    if found then
      update public.document_questions
      set
        status = 'failed', locked_at = null, locked_by = null, failed_at = now(),
        error_code = 'worker_timeout', answer_text = null, source_references = '[]'::jsonb,
        provider = null, model_identifier = null, completed_at = null,
        source_item_count = 0, source_character_count = 0, provider_call_count = 0
      where id = target_question.id;
    end if;
  end loop;

  select document.id into claimed_document_id
  from public.documents as document
  join public.document_questions as question on question.document_id = document.id
  where question.status = 'queued'
    and question.available_at <= now()
    and question.attempt_count < question.max_attempts
    and document.upload_status = 'uploaded'
    and document.processing_status = 'completed'
    and document.deleted_at is null
  order by question.available_at asc, question.requested_at asc
  limit 1
  for update of document skip locked;
  if claimed_document_id is null then return; end if;

  select * into target_question
  from public.document_questions as question
  where question.document_id = claimed_document_id
    and question.status = 'queued'
    and question.available_at <= now()
    and question.attempt_count < question.max_attempts
  for update;
  if not found then return; end if;
  select * into target_document from public.documents as document where document.id = claimed_document_id;

  update public.document_questions
  set
    status = 'answering', attempt_count = target_question.attempt_count + 1,
    locked_at = now(), locked_by = btrim(worker_identity), started_at = now(),
    completed_at = null, failed_at = null, error_code = null
  where id = target_question.id
  returning * into target_question;

  return query select
    target_question.id, target_document.id, target_document.household_id,
    target_question.language, target_question.question, target_question.prompt_version,
    target_question.attempt_count, target_question.max_attempts;
end;
$$;

-- Completes a claimed question atomically. The provider may return only opaque
-- source labels; the worker resolves them to real source rows before this
-- function verifies same-document page/chunk coordinates and excerpts.
create or replace function public.complete_document_question_job(
  target_question_id uuid,
  expected_worker_identity text,
  completed_answer_text text,
  completed_source_references jsonb,
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
  target_document_id uuid;
  target_document public.documents%rowtype;
  target_question public.document_questions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Question worker authorization is required.' using errcode = '42501';
  end if;
  select question.document_id into target_document_id from public.document_questions as question where question.id = target_question_id;
  if target_document_id is null then return false; end if;
  select * into target_document from public.documents as document where document.id = target_document_id for update;
  if not found then return false; end if;
  select * into target_question from public.document_questions as question
  where question.id = target_question_id and question.document_id = target_document.id for update;
  if not found or target_question.status <> 'answering' or target_question.locked_by is distinct from expected_worker_identity then
    return false;
  end if;

  if target_document.upload_status <> 'uploaded' or target_document.processing_status <> 'completed' or target_document.deleted_at is not null then
    update public.document_questions
    set
      status = 'failed', locked_at = null, locked_by = null, completed_at = null, failed_at = now(),
      error_code = 'document_unavailable', answer_text = null, source_references = '[]'::jsonb,
      provider = null, model_identifier = null, source_item_count = 0,
      source_character_count = 0, provider_call_count = 0
    where id = target_question.id;
    return false;
  end if;

  if completed_answer_text is null
    or completed_answer_text <> btrim(completed_answer_text)
    or char_length(completed_answer_text) not between 1 and 1800
    or coalesce(jsonb_typeof(completed_source_references), '') <> 'array'
    or jsonb_array_length(completed_source_references) not between 1 and 3
    or completed_source_coverage not in ('full', 'partial')
    or completed_source_item_count not between 1 and 48
    or completed_source_character_count not between 1 and 48000
    or completed_provider_call_count not between 1 and 2
    or completed_provider is null or completed_provider <> btrim(completed_provider)
    or char_length(completed_provider) not between 1 and 80
    or completed_model_identifier is null or completed_model_identifier <> btrim(completed_model_identifier)
    or char_length(completed_model_identifier) not between 1 and 160 then
    raise exception 'Document question output is invalid.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(completed_source_references) as reference_row(
      reference_id text, page_id uuid, page_number integer, chunk_id uuid, chunk_index integer, excerpt text
    )
    where reference_id is null or reference_id !~ '^source-[1-9][0-9]*$'
      or page_id is null or page_number is null or page_number < 1
      or (chunk_id is null and chunk_index is not null)
      or (chunk_id is not null and (chunk_index is null or chunk_index < 0))
      or excerpt is null or excerpt <> btrim(excerpt) or char_length(excerpt) not between 1 and 320
  ) or exists (
    select reference_id
    from jsonb_to_recordset(completed_source_references) as reference_row(
      reference_id text, page_id uuid, page_number integer, chunk_id uuid, chunk_index integer, excerpt text
    ) group by reference_id having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(completed_source_references) as reference_row(
      reference_id text, page_id uuid, page_number integer, chunk_id uuid, chunk_index integer, excerpt text
    )
    left join public.document_pages as page on page.id = reference_row.page_id
      and page.document_id = target_document.id and page.page_number = reference_row.page_number
    left join public.document_chunks as chunk on chunk.id = reference_row.chunk_id
      and chunk.document_id = target_document.id and chunk.page_id = reference_row.page_id
      and chunk.page_number = reference_row.page_number and chunk.chunk_index = reference_row.chunk_index
    where page.id is null
      or (reference_row.chunk_id is not null and chunk.id is null)
      or (reference_row.chunk_id is null and position(reference_row.excerpt in page.extracted_text) = 0)
      or (reference_row.chunk_id is not null and position(reference_row.excerpt in chunk.content) = 0)
  ) then
    raise exception 'Document question sources are invalid.' using errcode = '22023';
  end if;

  update public.document_questions
  set
    status = 'completed', locked_at = null, locked_by = null, completed_at = now(), failed_at = null,
    error_code = null, answer_text = completed_answer_text, source_references = completed_source_references,
    provider = completed_provider, model_identifier = completed_model_identifier,
    source_coverage = completed_source_coverage, source_item_count = completed_source_item_count,
    source_character_count = completed_source_character_count, provider_call_count = completed_provider_call_count
  where id = target_question.id;
  return true;
end;
$$;

-- Failure contains a fixed safe code only. Raw provider/database details are
-- neither persisted here nor returned through the member-facing UI.
create or replace function public.fail_document_question_job(
  target_question_id uuid,
  expected_worker_identity text,
  safe_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document_id uuid;
  target_document public.documents%rowtype;
  target_question public.document_questions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Question worker authorization is required.' using errcode = '42501';
  end if;
  if safe_error_code not in (
    'configuration_unavailable', 'provider_timeout', 'provider_unavailable',
    'provider_request_rejected', 'provider_invalid_response', 'source_validation_failed',
    'input_limit_exceeded', 'worker_timeout', 'document_unavailable'
  ) then
    raise exception 'Question failure code is invalid.' using errcode = '22023';
  end if;
  select question.document_id into target_document_id from public.document_questions as question where question.id = target_question_id;
  if target_document_id is null then return false; end if;
  select * into target_document from public.documents as document where document.id = target_document_id for update;
  if not found then return false; end if;
  select * into target_question from public.document_questions as question
  where question.id = target_question_id and question.document_id = target_document.id for update;
  if not found or target_question.status <> 'answering' or target_question.locked_by is distinct from expected_worker_identity then
    return false;
  end if;
  update public.document_questions
  set
    status = 'failed', locked_at = null, locked_by = null, completed_at = null, failed_at = now(),
    error_code = case when target_document.upload_status <> 'uploaded'
      or target_document.processing_status <> 'completed' or target_document.deleted_at is not null
      then 'document_unavailable' else safe_error_code end,
    answer_text = null, source_references = '[]'::jsonb, provider = null, model_identifier = null,
    source_item_count = 0, source_character_count = 0, provider_call_count = 0
  where id = target_question.id;
  return true;
end;
$$;

alter table public.document_questions enable row level security;
alter table public.document_questions force row level security;

create policy document_questions_select_active_document_members
  on public.document_questions for select to authenticated
  using (private.can_read_document_question(document_id));

revoke all on table public.document_questions from public, anon, authenticated;

revoke all on function private.can_read_document_question(uuid) from public, anon, authenticated;
grant execute on function private.can_read_document_question(uuid) to authenticated;
revoke all on function private.document_question_matches_document() from public, anon, authenticated;
revoke all on function private.cancel_document_questions_on_archive() from public, anon, authenticated;

revoke all on function public.request_document_question(uuid, text, text) from public, anon;
grant execute on function public.request_document_question(uuid, text, text) to authenticated;
revoke all on function public.get_document_question_status(uuid) from public, anon;
grant execute on function public.get_document_question_status(uuid) to authenticated;
revoke all on function public.get_document_questions(uuid) from public, anon;
grant execute on function public.get_document_questions(uuid) to authenticated;
revoke all on function public.claim_next_document_question_job(text) from public, anon, authenticated;
revoke all on function public.complete_document_question_job(uuid, text, text, jsonb, text, integer, integer, text, text, integer) from public, anon, authenticated;
revoke all on function public.fail_document_question_job(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_next_document_question_job(text) to service_role;
grant execute on function public.complete_document_question_job(uuid, text, text, jsonb, text, integer, integer, text, text, integer) to service_role;
grant execute on function public.fail_document_question_job(uuid, text, text) to service_role;
