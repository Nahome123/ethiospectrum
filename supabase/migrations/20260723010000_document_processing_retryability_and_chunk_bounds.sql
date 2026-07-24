-- ETH-014 follow-up: expose only retry eligibility to authorized members and
-- enforce the worker's per-chunk size limit for all newly written derivatives.
-- The original processing migration may already be applied and is immutable.

alter table public.document_chunks
  drop constraint if exists document_chunks_character_count_maximum;
-- Historical, dormant pre-ETH-014 chunks are not rewritten by this feature.
-- NOT VALID still enforces the bound for every new or updated chunk row.
alter table public.document_chunks
  add constraint document_chunks_character_count_maximum
  check (character_count <= 1200) not valid;

-- PostgreSQL does not permit changing a function's TABLE return shape in
-- place. Recreate this deliberately narrow member-facing read surface.
drop function public.get_document_processing_status(uuid);

create function public.get_document_processing_status(target_document_id uuid)
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
  from public.document_processing_jobs as job
  where job.document_id = target_document_id;
end;
$$;

revoke all on function public.get_document_processing_status(uuid) from public, anon;
grant execute on function public.get_document_processing_status(uuid) to authenticated;
