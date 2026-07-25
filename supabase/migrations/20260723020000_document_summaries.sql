-- ETH-015: secure, source-grounded document summaries.
--
-- Keep summaries separate from the dormant generic document_analyses draft
-- table. A summary has a queue lifecycle, household/request ownership, safe
-- retry metadata, and source-reference integrity requirements that the draft
-- table does not provide.

create table public.document_summaries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  language text not null check (language in ('en', 'am', 'es')),
  status text not null default 'queued'
    check (status in ('queued', 'generating', 'completed', 'failed')),
  summary_text text,
  structured_summary jsonb,
  source_references jsonb not null default '[]'::jsonb,
  provider text,
  model_identifier text,
  prompt_version text not null default 'document-summary-v1',
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
  provider_call_count integer not null default 0 check (provider_call_count between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_summaries_document_language_key unique (document_id, language),
  constraint document_summaries_attempt_limit check (attempt_count <= max_attempts),
  constraint document_summaries_lock_state check (
    (status = 'generating' and locked_at is not null and locked_by is not null)
    or (status <> 'generating' and locked_at is null and locked_by is null)
  ),
  constraint document_summaries_locked_by_valid check (
    locked_by is null or char_length(locked_by) between 1 and 128
  ),
  constraint document_summaries_safe_metadata check (
    (provider is null or (provider = btrim(provider) and char_length(provider) between 1 and 80))
    and (model_identifier is null or (model_identifier = btrim(model_identifier) and char_length(model_identifier) between 1 and 160))
    and prompt_version = btrim(prompt_version)
    and char_length(prompt_version) between 1 and 80
    and (error_code is null or error_code in (
      'configuration_unavailable',
      'provider_timeout',
      'provider_unavailable',
      'provider_transient_failure',
      'provider_request_rejected',
      'provider_invalid_response',
      'provider_invalid_output',
      'source_validation_failed',
      'input_limit_exceeded',
      'worker_timeout',
      'document_unavailable',
      'document_archived'
    ))
  ),
  constraint document_summaries_output_shape check (
    jsonb_typeof(source_references) = 'array'
    and jsonb_array_length(source_references) <= 135
    and (structured_summary is null or jsonb_typeof(structured_summary) = 'object')
    -- This remains bounded while allowing valid Unicode-heavy output (for
    -- example Amharic) whose UTF-8 byte length exceeds its character count.
    and (structured_summary is null or octet_length(structured_summary::text) <= 120000)
    and (summary_text is null or (summary_text = btrim(summary_text) and char_length(summary_text) between 1 and 12000))
  ),
  constraint document_summaries_completed_output check (
    status <> 'completed'
    or (
      structured_summary is not null
      and jsonb_array_length(source_references) > 0
      and provider is not null
      and model_identifier is not null
      and completed_at is not null
      and failed_at is null
      and source_item_count > 0
      and source_character_count > 0
      and provider_call_count > 0
    )
  ),
  constraint document_summaries_noncompleted_output check (
    status = 'completed'
    or (
      summary_text is null
      and structured_summary is null
      and source_references = '[]'::jsonb
      and completed_at is null
      and provider is null
      and model_identifier is null
      and source_item_count = 0
      and source_character_count = 0
      and provider_call_count = 0
    )
  ),
  constraint document_summaries_failure_timestamp check (
    status <> 'failed' or failed_at is not null
  )
);

create index document_summaries_household_status_requested_idx
  on public.document_summaries (household_id, status, requested_at desc);
create index document_summaries_household_language_idx
  on public.document_summaries (household_id, language);
create index document_summaries_queued_available_idx
  on public.document_summaries (available_at, requested_at)
  where status = 'queued';

drop trigger if exists document_summaries_set_updated_at on public.document_summaries;
create trigger document_summaries_set_updated_at
  before update on public.document_summaries
  for each row execute function private.set_updated_at();

-- Keep the denormalized household index value tied to the document. Browser
-- roles have no write grants either way, but this protects server-side callers
-- and future maintenance from creating a cross-household summary row.
create or replace function private.document_summary_matches_document()
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
    raise exception 'Document summary household does not match its document.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists document_summaries_match_document on public.document_summaries;
create trigger document_summaries_match_document
  before insert or update of document_id, household_id on public.document_summaries
  for each row execute function private.document_summary_matches_document();

-- The provider's strict schema is enforced again at the persistence boundary.
-- These helpers validate only opaque source labels, never provider requests or
-- document contents, and are intentionally unavailable to client roles.
create or replace function private.document_summary_source_keys_are_valid(
  source_keys jsonb,
  require_source boolean
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  source_key_count integer;
begin
  if jsonb_typeof(source_keys) <> 'array' then
    return false;
  end if;

  source_key_count := jsonb_array_length(source_keys);
  if source_key_count > 3 or (require_source and source_key_count = 0) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(source_keys) as source_key(value)
    where jsonb_typeof(source_key.value) <> 'string'
  ) or exists (
    select 1
    from jsonb_array_elements_text(source_keys) as source_key(value)
    group by source_key.value
    having count(*) > 1 or source_key.value !~ '^src_[0-9]{3,5}$'
  ) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function private.document_summary_text_item_is_valid(
  item jsonb,
  maximum_characters integer,
  allow_empty_text boolean
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  item_text text;
  source_key_count integer;
begin
  if jsonb_typeof(item) <> 'object'
    or not (item ?& array['text', 'sourceKeys'])
    or (select count(*) from jsonb_object_keys(item)) <> 2
    or jsonb_typeof(item -> 'text') <> 'string'
    or not private.document_summary_source_keys_are_valid(item -> 'sourceKeys', false) then
    return false;
  end if;

  item_text := item ->> 'text';
  source_key_count := jsonb_array_length(item -> 'sourceKeys');
  if item_text <> btrim(item_text) or char_length(item_text) > maximum_characters then
    return false;
  end if;

  if allow_empty_text then
    return (item_text = '' and source_key_count = 0)
      or (item_text <> '' and source_key_count between 1 and 3);
  end if;

  return char_length(item_text) between 1 and maximum_characters
    and source_key_count between 1 and 3;
end;
$$;

create or replace function private.document_summary_date_item_is_valid(item jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  date_value text;
  description_value text;
begin
  if jsonb_typeof(item) <> 'object'
    or not (item ?& array['date', 'description', 'sourceKeys'])
    or (select count(*) from jsonb_object_keys(item)) <> 3
    or jsonb_typeof(item -> 'date') <> 'string'
    or jsonb_typeof(item -> 'description') <> 'string'
    or not private.document_summary_source_keys_are_valid(item -> 'sourceKeys', true) then
    return false;
  end if;

  date_value := item ->> 'date';
  description_value := item ->> 'description';
  return date_value = btrim(date_value)
    and description_value = btrim(description_value)
    and char_length(date_value) between 1 and 96
    and char_length(description_value) between 1 and 700;
end;
$$;

create or replace function private.document_summary_organization_item_is_valid(item jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  name_value text;
  description_value text;
begin
  if jsonb_typeof(item) <> 'object'
    or not (item ?& array['name', 'description', 'sourceKeys'])
    or (select count(*) from jsonb_object_keys(item)) <> 3
    or jsonb_typeof(item -> 'name') <> 'string'
    or jsonb_typeof(item -> 'description') <> 'string'
    or not private.document_summary_source_keys_are_valid(item -> 'sourceKeys', true) then
    return false;
  end if;

  name_value := item ->> 'name';
  description_value := item ->> 'description';
  return name_value = btrim(name_value)
    and description_value = btrim(description_value)
    and char_length(name_value) between 1 and 96
    and char_length(description_value) between 1 and 700;
end;
$$;

create or replace function private.document_summary_output_is_valid(summary jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  item jsonb;
begin
  if jsonb_typeof(summary) <> 'object'
    or not (summary ?& array[
      'overview',
      'keyPoints',
      'importantDates',
      'actionItems',
      'organizationsOrPeople',
      'warningsOrUncertainties'
    ])
    or (select count(*) from jsonb_object_keys(summary)) <> 6
    or jsonb_typeof(summary -> 'keyPoints') <> 'array'
    or jsonb_typeof(summary -> 'importantDates') <> 'array'
    or jsonb_typeof(summary -> 'actionItems') <> 'array'
    or jsonb_typeof(summary -> 'organizationsOrPeople') <> 'array'
    or jsonb_typeof(summary -> 'warningsOrUncertainties') <> 'array'
    or jsonb_array_length(summary -> 'keyPoints') > 8
    or jsonb_array_length(summary -> 'importantDates') > 8
    or jsonb_array_length(summary -> 'actionItems') > 8
    or jsonb_array_length(summary -> 'organizationsOrPeople') > 12
    or jsonb_array_length(summary -> 'warningsOrUncertainties') > 8
    or not private.document_summary_text_item_is_valid(summary -> 'overview', 1600, true) then
    return false;
  end if;

  for item in select value from jsonb_array_elements(summary -> 'keyPoints') loop
    if not private.document_summary_text_item_is_valid(item, 700, false) then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(summary -> 'importantDates') loop
    if not private.document_summary_date_item_is_valid(item) then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(summary -> 'actionItems') loop
    if not private.document_summary_text_item_is_valid(item, 700, false) then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(summary -> 'organizationsOrPeople') loop
    if not private.document_summary_organization_item_is_valid(item) then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(summary -> 'warningsOrUncertainties') loop
    if not private.document_summary_text_item_is_valid(item, 700, false) then return false; end if;
  end loop;

  return true;
end;
$$;

-- A provider's opaque source keys are never persisted, so the persistence
-- boundary verifies their count per rendered statement. This prevents a
-- service-side caller from storing a structured statement that claims more
-- source support than the protected source-reference list preserves.
create or replace function private.document_summary_references_cover_output(
  summary jsonb,
  source_references jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  section_name text;
  section_items jsonb;
  item_position integer;
  expected_reference_count integer;
  actual_reference_count integer;
begin
  if not private.document_summary_output_is_valid(summary)
    or jsonb_typeof(source_references) <> 'array' then
    return false;
  end if;

  foreach section_name in array array[
    'overview',
    'keyPoints',
    'importantDates',
    'actionItems',
    'organizationsOrPeople',
    'warningsOrUncertainties'
  ] loop
    if section_name = 'overview' then
      expected_reference_count := jsonb_array_length(summary -> 'overview' -> 'sourceKeys');
      select count(*) into actual_reference_count
      from jsonb_array_elements(source_references) as reference(value)
      where reference.value ->> 'section' = section_name
        and reference.value -> 'item_index' = to_jsonb(0);
      if actual_reference_count <> expected_reference_count then
        return false;
      end if;
    else
      section_items := summary -> section_name;
      if jsonb_array_length(section_items) > 0 then
        for item_position in 0..jsonb_array_length(section_items) - 1 loop
          expected_reference_count := jsonb_array_length(
            section_items -> item_position -> 'sourceKeys'
          );
          select count(*) into actual_reference_count
          from jsonb_array_elements(source_references) as reference(value)
          where reference.value ->> 'section' = section_name
            and reference.value -> 'item_index' = to_jsonb(item_position);
          if actual_reference_count <> expected_reference_count then
            return false;
          end if;
        end loop;
      end if;
    end if;
  end loop;

  return true;
end;
$$;

-- This mirrors the extraction read boundary: active members (including
-- viewers) may read a summary only while its parent document remains active
-- and successfully processed.
create or replace function private.can_read_document_summary(target_document_id uuid)
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

-- Archiving revokes browser access through RLS immediately. It must also
-- release queued or claimed summary work so an archive cannot incur later AI
-- work through a stale scheduler invocation.
create or replace function private.cancel_document_summaries_on_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.upload_status <> 'archived' and new.upload_status = 'archived' then
    update public.document_summaries
    set
      status = 'failed',
      locked_at = null,
      locked_by = null,
      failed_at = now(),
      error_code = 'document_archived',
      summary_text = null,
      structured_summary = null,
      source_references = '[]'::jsonb,
      provider = null,
      model_identifier = null,
      completed_at = null,
      source_item_count = 0,
      source_character_count = 0,
      provider_call_count = 0
    where document_id = old.id
      and status in ('queued', 'generating');
  end if;
  return new;
end;
$$;

drop trigger if exists documents_cancel_summary_jobs_on_archive on public.documents;
create trigger documents_cancel_summary_jobs_on_archive
  after update of upload_status on public.documents
  for each row execute function private.cancel_document_summaries_on_archive();

-- Browser-reachable request boundary. The function derives the household,
-- requesting user, prompt version, document eligibility, and retry state in
-- PostgreSQL; callers supply only a document UUID and controlled locale.
create or replace function public.request_document_summary(
  target_document_id uuid,
  requested_language text
)
returns table (
  summary_id uuid,
  summary_status text,
  reused_completed boolean,
  already_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  target_summary public.document_summaries%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if requested_language not in ('en', 'am', 'es') then
    raise exception 'Summary language is invalid.' using errcode = '22023';
  end if;

  -- Take the parent lock first. Every competing request, archive, or worker
  -- path follows the same document-then-summary order.
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
    raise exception 'Document summary is unavailable.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.document_pages where document_id = target_document.id
  ) and not exists (
    select 1 from public.document_chunks where document_id = target_document.id
  ) then
    raise exception 'Document summary is unavailable.' using errcode = '22023';
  end if;

  select * into target_summary
  from public.document_summaries as summary
  where summary.document_id = target_document.id
    and summary.language = requested_language
  for update;

  if found and target_summary.status = 'completed' then
    return query select target_summary.id, target_summary.status, true, false;
    return;
  end if;

  if found and target_summary.status in ('queued', 'generating') then
    return query select target_summary.id, target_summary.status, false, true;
    return;
  end if;

  if found then
    if target_summary.status <> 'failed' or target_summary.attempt_count >= target_summary.max_attempts then
      raise exception 'Document summary cannot be retried.' using errcode = '22023';
    end if;

    update public.document_summaries
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
      summary_text = null,
      structured_summary = null,
      source_references = '[]'::jsonb,
      provider = null,
      model_identifier = null,
      source_coverage = 'full',
      source_item_count = 0,
      source_character_count = 0,
      provider_call_count = 0
    where id = target_summary.id
    returning * into target_summary;
  else
    insert into public.document_summaries (
      document_id,
      household_id,
      language,
      status,
      requested_by
    )
    values (
      target_document.id,
      target_document.household_id,
      requested_language,
      'queued',
      auth.uid()
    )
    returning * into target_summary;
  end if;

  return query select target_summary.id, target_summary.status, false, false;
end;
$$;

-- Narrow member-facing state only. Summary contents are governed by the
-- table's RLS policy; worker lock metadata and raw provider errors are never
-- exposed through this function.
create or replace function public.get_document_summary_status(
  target_document_id uuid,
  requested_language text
)
returns table (
  summary_id uuid,
  language text,
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
  if auth.uid() is null or requested_language not in ('en', 'am', 'es') then
    return;
  end if;

  if not private.can_read_document_summary(target_document_id) then
    return;
  end if;

  return query
  select
    summary.id,
    summary.language,
    summary.status,
    summary.status = 'failed' and summary.attempt_count < summary.max_attempts,
    summary.requested_at,
    summary.started_at,
    summary.completed_at,
    summary.failed_at,
    summary.source_coverage
  from public.document_summaries as summary
  where summary.document_id = target_document_id
    and summary.language = requested_language;
end;
$$;

-- Worker-only claim. It is intentionally inaccessible to browser sessions,
-- returns no document text, and reclaims stale locks into a bounded retryable
-- failed state before taking one due job with SKIP LOCKED.
create or replace function public.claim_next_document_summary_job(worker_identity text)
returns table (
  summary_id uuid,
  document_id uuid,
  household_id uuid,
  language text,
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
  target_summary public.document_summaries%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Summary worker authorization is required.' using errcode = '42501';
  end if;
  if worker_identity is null or char_length(btrim(worker_identity)) not between 1 and 128 then
    raise exception 'Worker identity is invalid.' using errcode = '22023';
  end if;

  for stale in
    select document.id as document_id, summary.id as summary_id
    from public.documents as document
    join public.document_summaries as summary on summary.document_id = document.id
    where summary.status = 'generating'
      and summary.locked_at < now() - interval '15 minutes'
      and document.upload_status = 'uploaded'
      and document.processing_status = 'completed'
      and document.deleted_at is null
    order by summary.locked_at asc
    limit 5
    for update of document skip locked
  loop
    select * into target_summary
    from public.document_summaries as summary
    where summary.id = stale.summary_id
      and summary.document_id = stale.document_id
      and summary.status = 'generating'
      and summary.locked_at < now() - interval '15 minutes'
    for update;

    if found then
      update public.document_summaries
      set
        status = 'failed',
        locked_at = null,
        locked_by = null,
        failed_at = now(),
        error_code = 'worker_timeout',
        summary_text = null,
        structured_summary = null,
        source_references = '[]'::jsonb,
        provider = null,
        model_identifier = null,
        completed_at = null,
        source_item_count = 0,
        source_character_count = 0,
        provider_call_count = 0
      where id = target_summary.id;
    end if;
  end loop;

  select document.id into claimed_document_id
  from public.documents as document
  join public.document_summaries as summary on summary.document_id = document.id
  where summary.status = 'queued'
    and summary.available_at <= now()
    and summary.attempt_count < summary.max_attempts
    and document.upload_status = 'uploaded'
    and document.processing_status = 'completed'
    and document.deleted_at is null
  order by summary.available_at asc, summary.requested_at asc
  limit 1
  for update of document skip locked;

  if claimed_document_id is null then
    return;
  end if;

  select * into target_summary
  from public.document_summaries as summary
  where summary.document_id = claimed_document_id
    and summary.status = 'queued'
    and summary.available_at <= now()
    and summary.attempt_count < summary.max_attempts
  for update;
  if not found then
    return;
  end if;

  select * into target_document
  from public.documents as document
  where document.id = claimed_document_id;

  update public.document_summaries
  set
    status = 'generating',
    attempt_count = target_summary.attempt_count + 1,
    locked_at = now(),
    locked_by = btrim(worker_identity),
    started_at = now(),
    completed_at = null,
    failed_at = null,
    error_code = null
  where id = target_summary.id
  returning * into target_summary;

  return query
  select
    target_summary.id,
    target_document.id,
    target_document.household_id,
    target_summary.language,
    target_summary.prompt_version,
    target_summary.attempt_count,
    target_summary.max_attempts;
end;
$$;

-- Completes a claimed job atomically. The provider is never allowed to choose
-- database identities: the worker resolves provider labels to trusted page and
-- chunk IDs, and this function verifies that each reference belongs to the
-- claimed document before persisting it.
create or replace function public.complete_document_summary_job(
  target_summary_id uuid,
  expected_worker_identity text,
  completed_summary_text text,
  completed_structured_summary jsonb,
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
  target_summary public.document_summaries%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Summary worker authorization is required.' using errcode = '42501';
  end if;

  select summary.document_id into target_document_id
  from public.document_summaries as summary
  where summary.id = target_summary_id;
  if target_document_id is null then
    return false;
  end if;

  select * into target_document
  from public.documents as document
  where document.id = target_document_id
  for update;
  if not found then
    return false;
  end if;

  select * into target_summary
  from public.document_summaries as summary
  where summary.id = target_summary_id
    and summary.document_id = target_document.id
  for update;
  if not found
    or target_summary.status <> 'generating'
    or target_summary.locked_by is distinct from expected_worker_identity then
    return false;
  end if;

  if target_document.upload_status <> 'uploaded'
    or target_document.processing_status <> 'completed'
    or target_document.deleted_at is not null then
    update public.document_summaries
    set
      status = 'failed',
      locked_at = null,
      locked_by = null,
      failed_at = now(),
      error_code = 'document_unavailable',
      summary_text = null,
      structured_summary = null,
      source_references = '[]'::jsonb,
      provider = null,
      model_identifier = null,
      completed_at = null,
      source_item_count = 0,
      source_character_count = 0,
      provider_call_count = 0
    where id = target_summary.id;
    return false;
  end if;

  if (completed_summary_text is not null and (
      completed_summary_text <> btrim(completed_summary_text)
      or char_length(completed_summary_text) not between 1 and 12000
    ))
    or completed_structured_summary is null
    or octet_length(completed_structured_summary::text) > 120000
    or not private.document_summary_output_is_valid(completed_structured_summary)
    or coalesce(jsonb_typeof(completed_source_references), '') <> 'array'
    or jsonb_array_length(completed_source_references) not between 1 and 135
    or not private.document_summary_references_cover_output(
      completed_structured_summary,
      completed_source_references
    )
    or completed_source_coverage not in ('full', 'partial')
    or completed_source_item_count not between 1 and 48
    or completed_source_character_count not between 1 and 48000
    or completed_provider_call_count not between 1 and 6
    or completed_provider is null
    or completed_provider <> btrim(completed_provider)
    or char_length(completed_provider) not between 1 and 80
    or completed_model_identifier is null
    or completed_model_identifier <> btrim(completed_model_identifier)
    or char_length(completed_model_identifier) not between 1 and 160 then
    raise exception 'Document summary output is invalid.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(completed_source_references) as reference_row(
      reference_id text,
      section text,
      item_index integer,
      page_id uuid,
      page_number integer,
      chunk_id uuid,
      chunk_index integer,
      excerpt text
    )
    where reference_id is null
      or reference_id !~ '^source-[1-9][0-9]*$'
      or section is null
      or section not in (
        'overview',
        'keyPoints',
        'importantDates',
        'actionItems',
        'organizationsOrPeople',
        'warningsOrUncertainties'
      )
      or item_index is null
      or item_index not between 0 and 16
      or (section = 'overview' and item_index <> 0)
      or (section = 'keyPoints' and item_index >= jsonb_array_length(completed_structured_summary -> 'keyPoints'))
      or (section = 'importantDates' and item_index >= jsonb_array_length(completed_structured_summary -> 'importantDates'))
      or (section = 'actionItems' and item_index >= jsonb_array_length(completed_structured_summary -> 'actionItems'))
      or (section = 'organizationsOrPeople' and item_index >= jsonb_array_length(completed_structured_summary -> 'organizationsOrPeople'))
      or (section = 'warningsOrUncertainties' and item_index >= jsonb_array_length(completed_structured_summary -> 'warningsOrUncertainties'))
      or (section = 'overview' and jsonb_array_length(completed_structured_summary -> 'overview' -> 'sourceKeys') = 0)
      or (section = 'keyPoints' and jsonb_array_length(completed_structured_summary -> 'keyPoints' -> item_index -> 'sourceKeys') = 0)
      or (section = 'importantDates' and jsonb_array_length(completed_structured_summary -> 'importantDates' -> item_index -> 'sourceKeys') = 0)
      or (section = 'actionItems' and jsonb_array_length(completed_structured_summary -> 'actionItems' -> item_index -> 'sourceKeys') = 0)
      or (section = 'organizationsOrPeople' and jsonb_array_length(completed_structured_summary -> 'organizationsOrPeople' -> item_index -> 'sourceKeys') = 0)
      or (section = 'warningsOrUncertainties' and jsonb_array_length(completed_structured_summary -> 'warningsOrUncertainties' -> item_index -> 'sourceKeys') = 0)
      or page_id is null
      or page_number is null
      or page_number < 1
      or (chunk_id is null and chunk_index is not null)
      or (chunk_id is not null and (chunk_index is null or chunk_index < 0))
      or excerpt is null
      or excerpt <> btrim(excerpt)
      or char_length(excerpt) not between 1 and 320
  ) or exists (
    select reference_id
    from jsonb_to_recordset(completed_source_references) as reference_row(
      reference_id text,
      section text,
      item_index integer,
      page_id uuid,
      page_number integer,
      chunk_id uuid,
      chunk_index integer,
      excerpt text
    )
    group by reference_id
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(completed_source_references) as reference_row(
      reference_id text,
      section text,
      item_index integer,
      page_id uuid,
      page_number integer,
      chunk_id uuid,
      chunk_index integer,
      excerpt text
    )
    left join public.document_pages as page
      on page.id = reference_row.page_id
      and page.document_id = target_document.id
      and page.page_number = reference_row.page_number
    left join public.document_chunks as chunk
      on chunk.id = reference_row.chunk_id
      and chunk.document_id = target_document.id
      and chunk.page_id = reference_row.page_id
      and chunk.page_number = reference_row.page_number
      and chunk.chunk_index = reference_row.chunk_index
    where page.id is null
      or (reference_row.chunk_id is not null and chunk.id is null)
      or (
        reference_row.chunk_id is null
        and position(reference_row.excerpt in page.extracted_text) = 0
      )
      or (
        reference_row.chunk_id is not null
        and position(reference_row.excerpt in chunk.content) = 0
      )
  ) then
    raise exception 'Document summary sources are invalid.' using errcode = '22023';
  end if;

  update public.document_summaries
  set
    status = 'completed',
    locked_at = null,
    locked_by = null,
    completed_at = now(),
    failed_at = null,
    error_code = null,
    summary_text = completed_summary_text,
    structured_summary = completed_structured_summary,
    source_references = completed_source_references,
    provider = completed_provider,
    model_identifier = completed_model_identifier,
    source_coverage = completed_source_coverage,
    source_item_count = completed_source_item_count,
    source_character_count = completed_source_character_count,
    provider_call_count = completed_provider_call_count
  where id = target_summary.id;
  return true;
end;
$$;

-- Worker failure stores only a bounded code. The database deliberately has no
-- raw provider-error column, preventing accidental persistence or client
-- exposure of request/provider details.
create or replace function public.fail_document_summary_job(
  target_summary_id uuid,
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
  target_summary public.document_summaries%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Summary worker authorization is required.' using errcode = '42501';
  end if;
  if safe_error_code not in (
    'configuration_unavailable',
    'provider_timeout',
    'provider_unavailable',
    'provider_transient_failure',
    'provider_request_rejected',
    'provider_invalid_response',
    'provider_invalid_output',
    'source_validation_failed',
    'input_limit_exceeded',
    'worker_timeout',
    'document_unavailable'
  ) then
    raise exception 'Summary failure code is invalid.' using errcode = '22023';
  end if;

  select summary.document_id into target_document_id
  from public.document_summaries as summary
  where summary.id = target_summary_id;
  if target_document_id is null then
    return false;
  end if;

  select * into target_document
  from public.documents as document
  where document.id = target_document_id
  for update;
  if not found then
    return false;
  end if;

  select * into target_summary
  from public.document_summaries as summary
  where summary.id = target_summary_id
    and summary.document_id = target_document.id
  for update;
  if not found
    or target_summary.status <> 'generating'
    or target_summary.locked_by is distinct from expected_worker_identity then
    return false;
  end if;

  update public.document_summaries
  set
    status = 'failed',
    locked_at = null,
    locked_by = null,
    completed_at = null,
    failed_at = now(),
    error_code = case
      when target_document.upload_status <> 'uploaded'
        or target_document.processing_status <> 'completed'
        or target_document.deleted_at is not null then 'document_unavailable'
      else safe_error_code
    end,
    summary_text = null,
    structured_summary = null,
    source_references = '[]'::jsonb,
    provider = null,
    model_identifier = null,
    source_item_count = 0,
    source_character_count = 0,
    provider_call_count = 0
  where id = target_summary.id;
  return true;
end;
$$;

alter table public.document_summaries enable row level security;
alter table public.document_summaries force row level security;

drop policy if exists document_summaries_select_active_document_members on public.document_summaries;
create policy document_summaries_select_active_document_members
  on public.document_summaries for select to authenticated
  using (private.can_read_document_summary(document_id));

revoke all on table public.document_summaries from public, anon, authenticated;
grant select on table public.document_summaries to authenticated;

revoke all on function private.can_read_document_summary(uuid) from public, anon, authenticated;
grant execute on function private.can_read_document_summary(uuid) to authenticated;
revoke all on function private.document_summary_matches_document() from public, anon, authenticated;
revoke all on function private.document_summary_source_keys_are_valid(jsonb, boolean) from public, anon, authenticated;
revoke all on function private.document_summary_text_item_is_valid(jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function private.document_summary_date_item_is_valid(jsonb) from public, anon, authenticated;
revoke all on function private.document_summary_organization_item_is_valid(jsonb) from public, anon, authenticated;
revoke all on function private.document_summary_output_is_valid(jsonb) from public, anon, authenticated;
revoke all on function private.document_summary_references_cover_output(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.cancel_document_summaries_on_archive() from public, anon, authenticated;

revoke all on function public.request_document_summary(uuid, text) from public, anon;
grant execute on function public.request_document_summary(uuid, text) to authenticated;
revoke all on function public.get_document_summary_status(uuid, text) from public, anon;
grant execute on function public.get_document_summary_status(uuid, text) to authenticated;
revoke all on function public.claim_next_document_summary_job(text) from public, anon, authenticated;
revoke all on function public.complete_document_summary_job(uuid, text, text, jsonb, jsonb, text, integer, integer, text, text, integer) from public, anon, authenticated;
revoke all on function public.fail_document_summary_job(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_next_document_summary_job(text) to service_role;
grant execute on function public.complete_document_summary_job(uuid, text, text, jsonb, jsonb, text, integer, integer, text, text, integer) to service_role;
grant execute on function public.fail_document_summary_job(uuid, text, text) to service_role;
