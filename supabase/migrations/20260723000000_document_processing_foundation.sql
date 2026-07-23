-- ETH-014: controlled private document-processing foundation.
--
-- This migration deliberately leaves AI analyses, embeddings, vector search,
-- OCR, and public sharing out of scope. Processing state is changed only by
-- reviewed queue/worker functions; browser clients cannot write job or
-- extracted-text tables directly.

-- ETH-012's trigger intentionally rejects every processing-status update.
-- Drop it only inside this transactional migration, then install the hardened
-- marker-backed replacement below before the migration commits.
drop trigger if exists documents_normalize on public.documents;
alter table public.documents drop constraint if exists documents_processing_status_valid;

-- `ready` and `deleted` were pre-processing placeholders. Previous releases
-- also had no job queue, so an old `processing` value cannot represent an
-- active worker claim. Archive state lives in upload_status/deleted_at; map
-- these placeholders only after the old trigger and constraint are out of the
-- way.
update public.documents
set processing_status = case
  when processing_status = 'ready' then 'completed'
  when processing_status = 'deleted' then 'not_started'
  when processing_status = 'processing' then 'not_started'
  else processing_status
end
where processing_status in ('ready', 'deleted', 'processing');

alter table public.documents
  add constraint documents_processing_status_valid
  check (
    processing_status in (
      'not_started',
      'queued',
      'processing',
      'completed',
      'failed',
      'unsupported',
      'needs_ocr'
    )
  );

-- ETH-007's draft tables are retained and strengthened rather than replaced.
-- The old vector column remains dormant; this issue neither writes embeddings
-- nor creates a vector retrieval feature.
alter table public.document_pages add column if not exists character_count integer;
update public.document_pages
set
  extracted_text = coalesce(extracted_text, ''),
  character_count = char_length(coalesce(extracted_text, ''))
where extracted_text is null or character_count is null;
alter table public.document_pages alter column extracted_text set not null;
alter table public.document_pages alter column character_count set not null;
alter table public.document_pages drop constraint if exists document_pages_character_count_valid;
alter table public.document_pages
  add constraint document_pages_character_count_valid
  check (character_count >= 0 and character_count = char_length(extracted_text));
alter table public.document_pages drop constraint if exists document_pages_id_document_id_key;
alter table public.document_pages
  add constraint document_pages_id_document_id_key unique (id, document_id);

alter table public.document_chunks add column if not exists page_id uuid;
alter table public.document_chunks add column if not exists character_count integer;
alter table public.document_chunks add column if not exists token_estimate integer;
update public.document_chunks
set character_count = char_length(content)
where character_count is null;
alter table public.document_chunks alter column character_count set not null;
alter table public.document_chunks drop constraint if exists document_chunks_character_count_valid;
alter table public.document_chunks
  add constraint document_chunks_character_count_valid
  check (character_count >= 0 and character_count = char_length(content));
alter table public.document_chunks drop constraint if exists document_chunks_token_estimate_valid;
alter table public.document_chunks
  add constraint document_chunks_token_estimate_valid
  check (token_estimate is null or token_estimate > 0);
alter table public.document_chunks drop constraint if exists document_chunks_page_document_fkey;
alter table public.document_chunks
  add constraint document_chunks_page_document_fkey
  foreign key (page_id, document_id)
  references public.document_pages(id, document_id)
  on delete cascade;

create table public.document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'unsupported', 'needs_ocr', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text check (locked_by is null or char_length(locked_by) between 1 and 128),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_code text check (error_code is null or char_length(error_code) between 1 and 64),
  error_message text check (error_message is null or char_length(error_message) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_processing_jobs_attempt_limit check (attempt_count <= max_attempts),
  constraint document_processing_jobs_lock_state check (
    (status = 'processing' and locked_at is not null and locked_by is not null)
    or (status <> 'processing' and locked_at is null and locked_by is null)
  )
);

create index document_processing_jobs_queued_available_idx
  on public.document_processing_jobs (available_at, created_at)
  where status = 'queued';

drop trigger if exists document_processing_jobs_set_updated_at on public.document_processing_jobs;
create trigger document_processing_jobs_set_updated_at
  before update on public.document_processing_jobs
  for each row execute function private.set_updated_at();

-- A private transaction marker makes the documents trigger reject forged
-- processing-status updates. Only no-grant private helpers used by reviewed
-- security-definer functions can create this marker.
create table private.document_processing_transition_markers (
  document_id uuid not null references public.documents(id) on delete cascade,
  transaction_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (document_id, transaction_id)
);

create or replace function private.document_processing_transition_is_valid(
  previous_status text,
  next_status text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    (previous_status = 'not_started' and next_status = 'queued')
    or (previous_status = 'failed' and next_status = 'queued')
    or (previous_status = 'queued' and next_status = 'processing')
    or (previous_status = 'queued' and next_status = 'failed')
    or (previous_status = 'processing' and next_status in ('completed', 'failed', 'unsupported', 'needs_ocr'));
$$;

create or replace function private.transition_document_processing_status(
  target_document_id uuid,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
begin
  select document.processing_status
  into previous_status
  from public.documents as document
  where document.id = target_document_id
  for update;

  if previous_status is null then
    raise exception 'Document processing target was not found.' using errcode = 'P0002';
  end if;

  if not private.document_processing_transition_is_valid(previous_status, next_status) then
    raise exception 'Invalid document processing transition.' using errcode = '22023';
  end if;

  insert into private.document_processing_transition_markers (document_id, transaction_id)
  values (target_document_id, txid_current());

  update public.documents
  set processing_status = next_status
  where id = target_document_id;

  delete from private.document_processing_transition_markers
  where document_id = target_document_id and transaction_id = txid_current();
end;
$$;

create or replace function private.can_read_document_extraction(target_document_id uuid)
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
      and document.deleted_at is null
      and private.is_active_household_member(document.household_id)
  );
$$;

create or replace function private.clear_document_processing_output(target_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.document_chunks where document_id = target_document_id;
  delete from public.document_pages where document_id = target_document_id;
end;
$$;

-- Keep ETH-012's generated private bucket/path and upload lifecycle intact.
-- The only intentional relaxation is a marker-backed, allowlisted change to
-- processing_status made by the queue/worker helpers below.
create or replace function private.normalize_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_filename text;
  has_processing_marker boolean;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Authentication is required to upload a document.' using errcode = '42501';
    end if;

    new.id := gen_random_uuid();
    new.title := btrim(coalesce(new.title, ''));
    new.document_type := nullif(btrim(new.document_type), '');
    safe_filename := private.normalize_document_filename(new.original_filename);

    if (new.mime_type = 'application/pdf' and safe_filename !~ E'\\.pdf$')
      or (new.mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and safe_filename !~ E'\\.docx$')
      or (new.mime_type = 'text/plain' and safe_filename !~ E'\\.txt$') then
      raise exception 'Document filename does not match its declared type.' using errcode = '22023';
    end if;

    if not private.document_dependent_matches_household(new.dependent_id, new.household_id) then
      raise exception 'The selected dependent is not available to this household.' using errcode = '23514';
    end if;

    new.original_filename := safe_filename;
    new.uploaded_by := auth.uid();
    new.storage_bucket := 'family-documents';
    new.upload_status := 'pending';
    new.processing_status := 'not_started';
    new.deleted_at := null;
    new.created_at := now();
    new.updated_at := now();
    new.storage_path := private.document_storage_path(
      new.household_id,
      new.dependent_id,
      new.id,
      new.original_filename
    );
  else
    if new.id is distinct from old.id
      or new.household_id is distinct from old.household_id
      or new.dependent_id is distinct from old.dependent_id
      or new.uploaded_by is distinct from old.uploaded_by
      or new.title is distinct from old.title
      or new.original_filename is distinct from old.original_filename
      or new.storage_bucket is distinct from old.storage_bucket
      or new.storage_path is distinct from old.storage_path
      or new.mime_type is distinct from old.mime_type
      or new.file_size is distinct from old.file_size
      or new.document_type is distinct from old.document_type
      or new.detected_language is distinct from old.detected_language
      or new.created_at is distinct from old.created_at then
      raise exception 'Document identity and metadata cannot be changed after upload preparation.' using errcode = '42501';
    end if;

    if old.upload_status = 'archived' then
      raise exception 'Archived documents cannot be changed.' using errcode = '42501';
    end if;

    if new.processing_status is distinct from old.processing_status then
      select exists (
        select 1
        from private.document_processing_transition_markers as marker
        where marker.document_id = old.id
          and marker.transaction_id = txid_current()
      ) into has_processing_marker;

      if not has_processing_marker
        or not private.document_processing_transition_is_valid(old.processing_status, new.processing_status) then
        raise exception 'Document processing status cannot be changed directly.' using errcode = '42501';
      end if;
    end if;

    if new.upload_status is distinct from old.upload_status then
      if new.upload_status in ('uploaded', 'failed')
        and (
          old.uploaded_by is distinct from auth.uid()
          or not private.has_household_permission(
            old.household_id,
            array['owner', 'administrator', 'member']::public.household_permission[]
          )
        ) then
        raise exception 'Only the original active uploader can finalize an upload.' using errcode = '42501';
      end if;

      if not (
        (old.upload_status = 'pending' and new.upload_status in ('failed', 'archived'))
        or (
          old.upload_status = 'pending'
          and new.upload_status = 'uploaded'
          and private.document_storage_object_matches_metadata(
            old.storage_bucket,
            old.storage_path,
            old.file_size,
            old.mime_type
          )
        )
        or (old.upload_status in ('uploaded', 'failed') and new.upload_status = 'archived')
      ) then
        raise exception 'Invalid document upload status transition.' using errcode = '42501';
      end if;
    end if;

    if new.upload_status = 'archived' and old.upload_status <> 'archived' then
      new.deleted_at := now();
      update public.document_processing_jobs as job
      set
        status = 'cancelled',
        locked_at = null,
        locked_by = null,
        completed_at = coalesce(job.completed_at, now()),
        error_code = 'document_archived',
        error_message = 'Document processing was cancelled.',
        updated_at = now()
      where job.document_id = old.id and job.status in ('queued', 'processing');
    end if;

    if (new.upload_status = 'archived' and new.deleted_at is null)
      or (new.upload_status <> 'archived' and new.deleted_at is not null) then
      raise exception 'Document archive state is invalid.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists documents_normalize on public.documents;
create trigger documents_normalize
  before insert or update on public.documents
  for each row execute function private.normalize_document();

-- Queueing is the only browser-reachable state mutation. It derives the
-- caller, household, document, and retry eligibility inside PostgreSQL.
create or replace function public.queue_document_processing(target_document_id uuid)
returns table (
  job_id uuid,
  processing_status text,
  attempt_count integer,
  already_queued boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  target_job public.document_processing_jobs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into target_document
  from public.documents as document
  where document.id = target_document_id
  for update;

  if not found
    or target_document.deleted_at is not null
    or target_document.upload_status <> 'uploaded'
    or not private.has_household_permission(
      target_document.household_id,
      array['owner', 'administrator', 'member']::public.household_permission[]
    ) then
    raise exception 'Document processing is unavailable.' using errcode = '42501';
  end if;

  if target_document.mime_type not in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ) then
    raise exception 'Document type is not supported.' using errcode = '22023';
  end if;

  if target_document.processing_status in ('completed', 'unsupported', 'needs_ocr') then
    raise exception 'Document processing is already terminal.' using errcode = '22023';
  end if;

  select * into target_job
  from public.document_processing_jobs as job
  where job.document_id = target_document.id
  for update;

  if found and target_job.status in ('queued', 'processing') then
    return query
    select target_job.id, target_document.processing_status, target_job.attempt_count, true;
    return;
  end if;

  if found then
    if target_job.status <> 'failed' or target_job.attempt_count >= target_job.max_attempts then
      raise exception 'Document processing cannot be retried.' using errcode = '22023';
    end if;

    update public.document_processing_jobs
    set
      status = 'queued',
      available_at = now(),
      locked_at = null,
      locked_by = null,
      started_at = null,
      completed_at = null,
      failed_at = null,
      error_code = null,
      error_message = null
    where id = target_job.id
    returning * into target_job;
  else
    insert into public.document_processing_jobs (document_id, status)
    values (target_document.id, 'queued')
    returning * into target_job;
  end if;

  perform private.transition_document_processing_status(target_document.id, 'queued');

  return query
  select target_job.id, 'queued'::text, target_job.attempt_count, false;
end;
$$;

-- This narrow read surface supports the protected detail page without exposing
-- job locks, error details, or worker metadata to browser sessions.
create or replace function public.get_document_processing_status(target_document_id uuid)
returns table (
  status text,
  attempt_count integer,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if not exists (
    select 1
    from public.documents as document
    where document.id = target_document_id
      and document.upload_status = 'uploaded'
      and document.deleted_at is null
      and private.is_active_household_member(document.household_id)
  ) then
    return;
  end if;

  return query
  select job.status, job.attempt_count, job.started_at, job.completed_at, job.failed_at
  from public.document_processing_jobs as job
  where job.document_id = target_document_id;
end;
$$;

-- This worker-only function claims a single due job using row locking. It is
-- intentionally inaccessible to authenticated browser sessions.
create or replace function public.claim_next_document_processing_job(worker_identity text)
returns table (
  job_id uuid,
  document_id uuid,
  household_id uuid,
  dependent_id uuid,
  storage_bucket text,
  storage_path text,
  original_filename text,
  mime_type text,
  file_size bigint,
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
  target_job public.document_processing_jobs%rowtype;
  target_document public.documents%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Processing worker authorization is required.' using errcode = '42501';
  end if;
  if worker_identity is null or char_length(btrim(worker_identity)) not between 1 and 128 then
    raise exception 'Worker identity is invalid.' using errcode = '22023';
  end if;

  -- A worker crash cannot hold a document forever. The next protected worker
  -- pass turns stale claims into a bounded, user-retryable failed state.
  for stale in
    select document.id as document_id
    from public.documents as document
    join public.document_processing_jobs as job on job.document_id = document.id
    where job.status = 'processing'
      and job.locked_at < now() - interval '15 minutes'
      and document.upload_status = 'uploaded'
      and document.deleted_at is null
    order by job.locked_at asc
    limit 5
    for update of document skip locked
  loop
    select * into target_job
    from public.document_processing_jobs as job
    where job.document_id = stale.document_id
      and job.status = 'processing'
      and job.locked_at < now() - interval '15 minutes'
    for update;

    if not found then
      continue;
    end if;

    perform private.clear_document_processing_output(stale.document_id);
    update public.document_processing_jobs
    set
      status = 'failed',
      locked_at = null,
      locked_by = null,
      failed_at = now(),
      error_code = 'worker_timeout',
      error_message = 'Document processing could not be completed.'
    where id = target_job.id;
    perform private.transition_document_processing_status(stale.document_id, 'failed');
  end loop;

  -- Every mutating path takes the document lock before the job lock. That
  -- prevents archive, retry, and worker completion from deadlocking each
  -- other while preserving SKIP LOCKED behavior for concurrent workers.
  select document.id into claimed_document_id
  from public.documents as document
  join public.document_processing_jobs as job on job.document_id = document.id
  where job.status = 'queued'
    and job.available_at <= now()
    and job.attempt_count < job.max_attempts
    and document.upload_status = 'uploaded'
    and document.deleted_at is null
  order by job.available_at asc, job.created_at asc
  limit 1
  for update of document skip locked;

  if claimed_document_id is null then
    return;
  end if;

  select * into target_job
  from public.document_processing_jobs as job
  where job.document_id = claimed_document_id
    and job.status = 'queued'
    and job.available_at <= now()
    and job.attempt_count < job.max_attempts
  for update;
  if not found then
    return;
  end if;

  select * into target_document
  from public.documents as document
  where document.id = claimed_document_id;

  update public.document_processing_jobs
  set
    status = 'processing',
    attempt_count = target_job.attempt_count + 1,
    locked_at = now(),
    locked_by = btrim(worker_identity),
    started_at = now(),
    failed_at = null,
    error_code = null,
    error_message = null
  where id = target_job.id
  returning * into target_job;

  perform private.transition_document_processing_status(target_document.id, 'processing');

  return query
  select
    target_job.id,
    target_document.id,
    target_document.household_id,
    target_document.dependent_id,
    target_document.storage_bucket,
    target_document.storage_path,
    target_document.original_filename,
    target_document.mime_type,
    target_document.file_size,
    target_job.attempt_count,
    target_job.max_attempts;
end;
$$;

-- Writes extracted pages/chunks and the completed document state in one
-- database transaction. The worker provides only parser output; it cannot
-- choose household, document, storage, or status identity.
create or replace function public.complete_document_processing_job(
  target_job_id uuid,
  expected_worker_identity text,
  final_status text,
  page_rows jsonb,
  chunk_rows jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.document_processing_jobs%rowtype;
  target_document public.documents%rowtype;
  target_document_id uuid;
  inserted_chunks integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Processing worker authorization is required.' using errcode = '42501';
  end if;
  if final_status not in ('completed', 'unsupported', 'needs_ocr') then
    raise exception 'Processing completion status is invalid.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(page_rows), '') <> 'array'
    or coalesce(jsonb_typeof(chunk_rows), '') <> 'array' then
    raise exception 'Processing output is invalid.' using errcode = '22023';
  end if;

  select job.document_id into target_document_id
  from public.document_processing_jobs as job
  where job.id = target_job_id;
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

  select * into target_job
  from public.document_processing_jobs as job
  where job.id = target_job_id and job.document_id = target_document.id
  for update;
  if not found then
    return false;
  end if;
  if target_job.status <> 'processing' or target_job.locked_by is distinct from expected_worker_identity then
    return false;
  end if;

  if target_document.upload_status <> 'uploaded' or target_document.deleted_at is not null then
    perform private.clear_document_processing_output(target_document.id);
    update public.document_processing_jobs
    set
      status = 'cancelled',
      locked_at = null,
      locked_by = null,
      completed_at = now(),
      error_code = 'document_archived',
      error_message = 'Document processing was cancelled.'
    where id = target_job.id;
    return false;
  end if;

  if jsonb_array_length(page_rows) > 2000 or jsonb_array_length(chunk_rows) > 10000 then
    raise exception 'Processing output exceeds limits.' using errcode = '22023';
  end if;

  if final_status = 'completed' and (jsonb_array_length(page_rows) = 0 or jsonb_array_length(chunk_rows) = 0) then
    raise exception 'Completed processing requires text output.' using errcode = '22023';
  end if;
  if final_status <> 'completed' and (jsonb_array_length(page_rows) <> 0 or jsonb_array_length(chunk_rows) <> 0) then
    raise exception 'Terminal non-text status cannot store extraction output.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(page_rows) as page_row(page_number integer, content text, character_count integer)
    where page_number is null
      or page_number < 1
      or content is null
      or content = ''
      or character_count is null
      or character_count <> char_length(content)
  ) or exists (
    select page_number
    from jsonb_to_recordset(page_rows) as page_row(page_number integer, content text, character_count integer)
    group by page_number
    having count(*) > 1
  ) or coalesce((
    select sum(character_count)::bigint
    from jsonb_to_recordset(page_rows) as page_row(page_number integer, content text, character_count integer)
  ), 0) > 1048576 then
    raise exception 'Processing page output is invalid.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(chunk_rows) as chunk_row(
      page_number integer,
      chunk_index integer,
      content text,
      character_count integer,
      token_estimate integer
    )
    where page_number is null
      or page_number < 1
      or chunk_index is null
      or chunk_index < 0
      or content is null
      or content = ''
      or character_count is null
      or character_count <> char_length(content)
      or (token_estimate is not null and token_estimate < 1)
  ) or exists (
    select page_number, chunk_index
    from jsonb_to_recordset(chunk_rows) as chunk_row(
      page_number integer,
      chunk_index integer,
      content text,
      character_count integer,
      token_estimate integer
    )
    group by page_number, chunk_index
    having count(*) > 1
  ) then
    raise exception 'Processing chunk output is invalid.' using errcode = '22023';
  end if;

  perform private.clear_document_processing_output(target_document.id);

  insert into public.document_pages (document_id, page_number, extracted_text, character_count)
  select target_document.id, page_row.page_number, page_row.content, page_row.character_count
  from jsonb_to_recordset(page_rows) as page_row(page_number integer, content text, character_count integer)
  order by page_row.page_number asc;

  insert into public.document_chunks (
    document_id,
    page_id,
    page_number,
    chunk_index,
    content,
    character_count,
    token_estimate
  )
  select
    target_document.id,
    page.id,
    chunk_row.page_number,
    chunk_row.chunk_index,
    chunk_row.content,
    chunk_row.character_count,
    chunk_row.token_estimate
  from jsonb_to_recordset(chunk_rows) as chunk_row(
    page_number integer,
    chunk_index integer,
    content text,
    character_count integer,
    token_estimate integer
  )
  join public.document_pages as page
    on page.document_id = target_document.id
    and page.page_number = chunk_row.page_number
  order by chunk_row.page_number asc, chunk_row.chunk_index asc;

  select count(*) into inserted_chunks
  from public.document_chunks
  where document_id = target_document.id;
  if inserted_chunks <> jsonb_array_length(chunk_rows) then
    raise exception 'Processing chunks do not match document pages.' using errcode = '22023';
  end if;

  update public.document_processing_jobs
  set
    status = final_status,
    locked_at = null,
    locked_by = null,
    completed_at = now(),
    failed_at = null,
    error_code = null,
    error_message = null
  where id = target_job.id;
  perform private.transition_document_processing_status(target_document.id, final_status);
  return true;
end;
$$;

create or replace function public.fail_document_processing_job(
  target_job_id uuid,
  expected_worker_identity text,
  safe_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.document_processing_jobs%rowtype;
  target_document public.documents%rowtype;
  target_document_id uuid;
  safe_message text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Processing worker authorization is required.' using errcode = '42501';
  end if;
  if safe_error_code not in (
    'storage_download_failed',
    'file_validation_failed',
    'text_extraction_failed',
    'text_too_large',
    'worker_timeout'
  ) then
    raise exception 'Processing error code is invalid.' using errcode = '22023';
  end if;

  select job.document_id into target_document_id
  from public.document_processing_jobs as job
  where job.id = target_job_id;
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

  select * into target_job
  from public.document_processing_jobs as job
  where job.id = target_job_id and job.document_id = target_document.id
  for update;
  if not found then
    return false;
  end if;
  if target_job.status <> 'processing' or target_job.locked_by is distinct from expected_worker_identity then
    return false;
  end if;

  perform private.clear_document_processing_output(target_document.id);
  if target_document.upload_status <> 'uploaded' or target_document.deleted_at is not null then
    update public.document_processing_jobs
    set
      status = 'cancelled',
      locked_at = null,
      locked_by = null,
      completed_at = now(),
      error_code = 'document_archived',
      error_message = 'Document processing was cancelled.'
    where id = target_job.id;
    return false;
  end if;

  safe_message := case safe_error_code
    when 'storage_download_failed' then 'Document processing could not download the private file.'
    when 'file_validation_failed' then 'Document processing could not validate the private file.'
    when 'text_too_large' then 'Document processing exceeded the configured text limit.'
    when 'worker_timeout' then 'Document processing could not be completed.'
    else 'Document processing could not extract text.'
  end;

  update public.document_processing_jobs
  set
    status = 'failed',
    locked_at = null,
    locked_by = null,
    failed_at = now(),
    error_code = safe_error_code,
    error_message = safe_message
  where id = target_job.id;
  perform private.transition_document_processing_status(target_document.id, 'failed');
  return true;
end;
$$;

-- Parent-document authorization governs every derivative. Status remains on
-- public.documents; normal browser clients cannot query job internals or write
-- jobs/pages/chunks/analyses directly.
alter table public.document_processing_jobs enable row level security;
alter table public.document_processing_jobs force row level security;
alter table public.document_pages enable row level security;
alter table public.document_pages force row level security;
alter table public.document_chunks enable row level security;
alter table public.document_chunks force row level security;
alter table public.document_analyses enable row level security;
alter table public.document_analyses force row level security;

drop policy if exists document_pages_access on public.document_pages;
drop policy if exists document_chunks_access on public.document_chunks;
drop policy if exists analyses_access on public.document_analyses;
drop policy if exists document_pages_select_active_document_members on public.document_pages;
drop policy if exists document_chunks_select_active_document_members on public.document_chunks;

create policy document_pages_select_active_document_members
  on public.document_pages for select to authenticated
  using (private.can_read_document_extraction(document_id));
create policy document_chunks_select_active_document_members
  on public.document_chunks for select to authenticated
  using (private.can_read_document_extraction(document_id));

revoke all on table public.document_processing_jobs from public, anon, authenticated;
revoke all on table public.document_pages from public, anon, authenticated;
revoke all on table public.document_chunks from public, anon, authenticated;
revoke all on table public.document_analyses from public, anon, authenticated;
grant select on table public.document_pages to authenticated;
grant select on table public.document_chunks to authenticated;

revoke all on table private.document_processing_transition_markers from public, anon, authenticated;
revoke all on function private.document_processing_transition_is_valid(text, text) from public, anon, authenticated;
revoke all on function private.transition_document_processing_status(uuid, text) from public, anon, authenticated;
revoke all on function private.can_read_document_extraction(uuid) from public, anon, authenticated;
grant execute on function private.can_read_document_extraction(uuid) to authenticated;
revoke all on function private.clear_document_processing_output(uuid) from public, anon, authenticated;
revoke all on function private.normalize_document() from public, anon, authenticated;

revoke all on function public.queue_document_processing(uuid) from public, anon;
grant execute on function public.queue_document_processing(uuid) to authenticated;
revoke all on function public.get_document_processing_status(uuid) from public, anon;
grant execute on function public.get_document_processing_status(uuid) to authenticated;
revoke all on function public.claim_next_document_processing_job(text) from public, anon, authenticated;
revoke all on function public.complete_document_processing_job(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_document_processing_job(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_next_document_processing_job(text) to service_role;
grant execute on function public.complete_document_processing_job(uuid, text, text, jsonb, jsonb) to service_role;
grant execute on function public.fail_document_processing_job(uuid, text, text) to service_role;
