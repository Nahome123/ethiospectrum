-- ETH-016: bounded OCR fallback for scanned PDF documents.
--
-- OCR has its own lifecycle so a text-extraction job that reached `needs_ocr`
-- remains an auditable origin record. Only a protected OCR completion may move
-- a document from `needs_ocr` to `completed`, and only while replacement pages
-- and deterministic chunks are committed in the same transaction.

create table public.document_ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text check (locked_by is null or char_length(locked_by) between 1 and 128),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  provider text check (provider is null or char_length(provider) between 1 and 40),
  model_identifier text check (model_identifier is null or char_length(model_identifier) between 1 and 120),
  error_code text check (error_code is null or char_length(error_code) between 1 and 64),
  error_message text check (error_message is null or char_length(error_message) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_ocr_jobs_attempt_limit check (attempt_count <= max_attempts),
  constraint document_ocr_jobs_lock_state check (
    (status = 'processing' and locked_at is not null and locked_by is not null)
    or (status <> 'processing' and locked_at is null and locked_by is null)
  )
);

create index document_ocr_jobs_queued_available_idx
  on public.document_ocr_jobs (available_at, created_at)
  where status = 'queued';

create trigger document_ocr_jobs_set_updated_at
  before update on public.document_ocr_jobs
  for each row execute function private.set_updated_at();

-- The existing transition marker remains the only way to alter the protected
-- document status. OCR may complete a textless PDF, but a failed OCR attempt
-- deliberately leaves it at `needs_ocr` so a permitted user can retry.
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
    or (previous_status = 'processing' and next_status in ('completed', 'failed', 'unsupported', 'needs_ocr'))
    or (previous_status = 'needs_ocr' and next_status = 'completed');
$$;

-- Archive always takes precedence over an OCR lease. This separate trigger
-- avoids changing the previously-applied document-normalization function.
create or replace function private.cancel_document_ocr_job_on_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.upload_status = 'archived' and old.upload_status <> 'archived' then
    update public.document_ocr_jobs as job
    set
      status = 'cancelled',
      locked_at = null,
      locked_by = null,
      completed_at = coalesce(job.completed_at, now()),
      error_code = 'document_archived',
      error_message = 'OCR was cancelled because the document was archived.'
    where job.document_id = new.id and job.status in ('queued', 'processing');
  end if;
  return new;
end;
$$;

create trigger documents_cancel_ocr_job_on_archive
  after update of upload_status on public.documents
  for each row execute function private.cancel_document_ocr_job_on_archive();

-- The browser may request OCR for a textless, active PDF only. PostgreSQL
-- derives the caller and household context and returns an active job instead
-- of creating a duplicate.
create function public.queue_document_ocr(target_document_id uuid)
returns table (
  job_id uuid,
  ocr_status text,
  attempt_count integer,
  already_queued boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  target_job public.document_ocr_jobs%rowtype;
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
    or target_document.mime_type <> 'application/pdf'
    or target_document.processing_status <> 'needs_ocr'
    or not private.has_household_permission(
      target_document.household_id,
      array['owner', 'administrator', 'member']::public.household_permission[]
    ) then
    raise exception 'OCR is unavailable for this document.' using errcode = '42501';
  end if;

  select * into target_job
  from public.document_ocr_jobs as job
  where job.document_id = target_document.id
  for update;

  if found and target_job.status in ('queued', 'processing') then
    return query
    select target_job.id, target_job.status, target_job.attempt_count, true;
    return;
  end if;

  if found then
    if target_job.status <> 'failed' or target_job.attempt_count >= target_job.max_attempts then
      raise exception 'OCR cannot be retried.' using errcode = '22023';
    end if;

    update public.document_ocr_jobs
    set
      status = 'queued',
      available_at = now(),
      locked_at = null,
      locked_by = null,
      started_at = null,
      completed_at = null,
      failed_at = null,
      provider = null,
      model_identifier = null,
      error_code = null,
      error_message = null
    where id = target_job.id
    returning * into target_job;
  else
    insert into public.document_ocr_jobs (document_id)
    values (target_document.id)
    returning * into target_job;
  end if;

  return query
  select target_job.id, target_job.status, target_job.attempt_count, false;
end;
$$;

-- This approved, minimal read surface deliberately excludes provider metadata,
-- worker leases, technical errors, and any extracted text.
create function public.get_document_ocr_status(target_document_id uuid)
returns table (
  status text,
  attempt_count integer,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  retryable boolean
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
  select
    job.status,
    job.attempt_count,
    job.started_at,
    job.completed_at,
    job.failed_at,
    job.status = 'failed' and job.attempt_count < job.max_attempts
  from public.document_ocr_jobs as job
  where job.document_id = target_document_id;
end;
$$;

-- Claiming takes the document lock before its OCR job lock, preserving the
-- archive/retry order and using SKIP LOCKED so workers cannot double-claim.
create function public.claim_next_document_ocr_job(worker_identity text)
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
  target_job public.document_ocr_jobs%rowtype;
  target_document public.documents%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'OCR worker authorization is required.' using errcode = '42501';
  end if;
  if worker_identity is null or char_length(btrim(worker_identity)) not between 1 and 128 then
    raise exception 'Worker identity is invalid.' using errcode = '22023';
  end if;

  for stale in
    select document.id as document_id
    from public.documents as document
    join public.document_ocr_jobs as job on job.document_id = document.id
    where job.status = 'processing'
      and job.locked_at < now() - interval '15 minutes'
      and document.upload_status = 'uploaded'
      and document.deleted_at is null
      and document.processing_status = 'needs_ocr'
    order by job.locked_at asc
    limit 5
    for update of document skip locked
  loop
    select * into target_job
    from public.document_ocr_jobs as job
    where job.document_id = stale.document_id
      and job.status = 'processing'
      and job.locked_at < now() - interval '15 minutes'
    for update;
    if found then
      update public.document_ocr_jobs
      set
        status = 'failed',
        locked_at = null,
        locked_by = null,
        failed_at = now(),
        error_code = 'worker_timeout',
        error_message = 'OCR could not be completed.'
      where id = target_job.id;
    end if;
  end loop;

  select document.id into claimed_document_id
  from public.documents as document
  join public.document_ocr_jobs as job on job.document_id = document.id
  where job.status = 'queued'
    and job.available_at <= now()
    and job.attempt_count < job.max_attempts
    and document.upload_status = 'uploaded'
    and document.deleted_at is null
    and document.processing_status = 'needs_ocr'
    and document.mime_type = 'application/pdf'
  order by job.available_at asc, job.created_at asc
  limit 1
  for update of document skip locked;

  if claimed_document_id is null then
    return;
  end if;

  select * into target_job
  from public.document_ocr_jobs as job
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

  update public.document_ocr_jobs
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

-- OCR completion owns the document lifecycle transition and all derivative
-- replacement. A caller cannot supply document/household/storage identity.
create function public.complete_document_ocr_job(
  target_job_id uuid,
  expected_worker_identity text,
  completed_provider text,
  completed_model_identifier text,
  page_rows jsonb,
  chunk_rows jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.document_ocr_jobs%rowtype;
  target_document public.documents%rowtype;
  target_document_id uuid;
  inserted_chunks integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'OCR worker authorization is required.' using errcode = '42501';
  end if;
  if completed_provider is null or char_length(btrim(completed_provider)) not between 1 and 40
    or completed_model_identifier is null or char_length(btrim(completed_model_identifier)) not between 1 and 120
    or coalesce(jsonb_typeof(page_rows), '') <> 'array'
    or coalesce(jsonb_typeof(chunk_rows), '') <> 'array' then
    raise exception 'OCR output is invalid.' using errcode = '22023';
  end if;

  select job.document_id into target_document_id
  from public.document_ocr_jobs as job
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
  from public.document_ocr_jobs as job
  where job.id = target_job_id and job.document_id = target_document.id
  for update;
  if not found or target_job.status <> 'processing'
    or target_job.locked_by is distinct from expected_worker_identity then
    return false;
  end if;

  if target_document.upload_status <> 'uploaded'
    or target_document.deleted_at is not null
    or target_document.processing_status <> 'needs_ocr'
    or target_document.mime_type <> 'application/pdf' then
    update public.document_ocr_jobs
    set
      status = 'cancelled',
      locked_at = null,
      locked_by = null,
      completed_at = now(),
      error_code = 'document_unavailable',
      error_message = 'OCR was cancelled because the document is unavailable.'
    where id = target_job.id;
    return false;
  end if;

  if jsonb_array_length(page_rows) = 0
    or jsonb_array_length(chunk_rows) = 0
    or jsonb_array_length(page_rows) > 50
    or jsonb_array_length(chunk_rows) > 10000 then
    raise exception 'OCR output exceeds limits.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(page_rows) as page_row(page_number integer, content text, character_count integer)
    where page_number is null
      or page_number < 1
      or page_number > 50
      or content is null
      or content = ''
      or character_count is null
      or character_count <> char_length(content)
      or character_count > 12000
  ) or exists (
    select page_number
    from jsonb_to_recordset(page_rows) as page_row(page_number integer, content text, character_count integer)
    group by page_number
    having count(*) > 1
  ) or coalesce((
    select sum(character_count)::bigint
    from jsonb_to_recordset(page_rows) as page_row(page_number integer, content text, character_count integer)
  ), 0) > 1048576 then
    raise exception 'OCR page output is invalid.' using errcode = '22023';
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
      or page_number > 50
      or chunk_index is null
      or chunk_index < 0
      or content is null
      or content = ''
      or character_count is null
      or character_count <> char_length(content)
      or character_count > 1200
      or token_estimate is null
      or token_estimate < 1
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
  ) or exists (
    select 1
    from jsonb_to_recordset(chunk_rows) as chunk_row(
      page_number integer,
      chunk_index integer,
      content text,
      character_count integer,
      token_estimate integer
    )
    left join jsonb_to_recordset(page_rows) as page_row(page_number integer, content text, character_count integer)
      on page_row.page_number = chunk_row.page_number
    where page_row.page_number is null
  ) then
    raise exception 'OCR chunk output is invalid.' using errcode = '22023';
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
    raise exception 'OCR chunks do not match document pages.' using errcode = '22023';
  end if;

  update public.document_ocr_jobs
  set
    status = 'completed',
    locked_at = null,
    locked_by = null,
    completed_at = now(),
    failed_at = null,
    provider = btrim(completed_provider),
    model_identifier = btrim(completed_model_identifier),
    error_code = null,
    error_message = null
  where id = target_job.id;
  perform private.transition_document_processing_status(target_document.id, 'completed');
  return true;
end;
$$;

create function public.fail_document_ocr_job(
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
  target_job public.document_ocr_jobs%rowtype;
  target_document public.documents%rowtype;
  target_document_id uuid;
  safe_message text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'OCR worker authorization is required.' using errcode = '42501';
  end if;
  if safe_error_code not in (
    'storage_download_failed',
    'file_validation_failed',
    'ocr_unavailable',
    'ocr_render_failed',
    'ocr_timeout',
    'ocr_provider_failed',
    'ocr_output_empty',
    'ocr_output_too_large',
    'worker_timeout'
  ) then
    raise exception 'OCR error code is invalid.' using errcode = '22023';
  end if;

  select job.document_id into target_document_id
  from public.document_ocr_jobs as job
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
  from public.document_ocr_jobs as job
  where job.id = target_job_id and job.document_id = target_document.id
  for update;
  if not found or target_job.status <> 'processing'
    or target_job.locked_by is distinct from expected_worker_identity then
    return false;
  end if;

  if target_document.upload_status <> 'uploaded'
    or target_document.deleted_at is not null
    or target_document.processing_status <> 'needs_ocr'
    or target_document.mime_type <> 'application/pdf' then
    update public.document_ocr_jobs
    set
      status = 'cancelled',
      locked_at = null,
      locked_by = null,
      completed_at = now(),
      error_code = 'document_unavailable',
      error_message = 'OCR was cancelled because the document is unavailable.'
    where id = target_job.id;
    return false;
  end if;

  safe_message := case safe_error_code
    when 'storage_download_failed' then 'OCR could not download the private file.'
    when 'file_validation_failed' then 'OCR could not validate the PDF.'
    when 'ocr_unavailable' then 'OCR is not available at this time.'
    when 'ocr_render_failed' then 'OCR could not prepare the PDF pages.'
    when 'ocr_timeout' then 'OCR could not be completed in time.'
    when 'ocr_output_empty' then 'OCR did not detect usable text.'
    when 'ocr_output_too_large' then 'OCR output exceeded the configured limit.'
    when 'worker_timeout' then 'OCR could not be completed.'
    else 'OCR could not extract text.'
  end;

  update public.document_ocr_jobs
  set
    status = 'failed',
    locked_at = null,
    locked_by = null,
    failed_at = now(),
    error_code = safe_error_code,
    error_message = safe_message
  where id = target_job.id;
  return true;
end;
$$;

alter table public.document_ocr_jobs enable row level security;
alter table public.document_ocr_jobs force row level security;

revoke all on table public.document_ocr_jobs from public, anon, authenticated;
revoke all on function private.cancel_document_ocr_job_on_archive() from public, anon, authenticated;
revoke all on function public.queue_document_ocr(uuid) from public, anon;
revoke all on function public.get_document_ocr_status(uuid) from public, anon;
revoke all on function public.claim_next_document_ocr_job(text) from public, anon, authenticated;
revoke all on function public.complete_document_ocr_job(uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_document_ocr_job(uuid, text, text) from public, anon, authenticated;

grant execute on function public.queue_document_ocr(uuid) to authenticated;
grant execute on function public.get_document_ocr_status(uuid) to authenticated;
grant execute on function public.claim_next_document_ocr_job(text) to service_role;
grant execute on function public.complete_document_ocr_job(uuid, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.fail_document_ocr_job(uuid, text, text) to service_role;
grant select on table public.document_ocr_jobs to service_role;
