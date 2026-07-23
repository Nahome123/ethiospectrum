-- ETH-012: secure private household document uploads.
-- This migration deliberately keeps object authorization in PostgreSQL so the
-- authenticated SSR client never needs a service-role credential.

do $$
begin
  create type public.document_upload_status as enum ('pending', 'uploaded', 'failed', 'archived');
exception
  when duplicate_object then null;
end;
$$;

-- The existing foundation enum has no "not_started" value. Documents use text
-- here so this issue can represent the no-processing-yet state without changing
-- statuses used by future processing tables.
alter table public.documents alter column processing_status drop default;
alter table public.documents
  alter column processing_status type text using processing_status::text;
update public.documents
set processing_status = 'not_started'
where processing_status = 'pending';
alter table public.documents alter column processing_status set default 'not_started';

alter table public.documents add column if not exists storage_bucket text;
update public.documents set storage_bucket = 'family-documents' where storage_bucket is null;
alter table public.documents alter column storage_bucket set default 'family-documents';
alter table public.documents alter column storage_bucket set not null;

-- Document metadata is immutable after preparation. Preserve that invariant by
-- preventing a hard deletion of a dependent that would otherwise mutate its
-- linked documents through the legacy ON DELETE SET NULL action.
alter table public.documents drop constraint if exists documents_dependent_id_fkey;
alter table public.documents
  add constraint documents_dependent_id_fkey
  foreign key (dependent_id) references public.dependents(id) on delete restrict;

alter table public.documents add column if not exists upload_status public.document_upload_status;
-- Pre-ETH-012 rows do not have a trusted private-bucket path or verified
-- object metadata. Keep them fail-closed for a reviewed re-upload/migration
-- rather than presenting legacy storage as an authorized uploaded document.
update public.documents
set upload_status = case when deleted_at is null then 'failed'::public.document_upload_status else 'archived'::public.document_upload_status end
where upload_status is null;
alter table public.documents alter column upload_status set default 'pending';
alter table public.documents alter column upload_status set not null;

alter table public.documents drop constraint if exists documents_storage_path_key;
alter table public.documents drop constraint if exists documents_mime_type_check;
alter table public.documents drop constraint if exists documents_file_size_check;
alter table public.documents drop constraint if exists documents_title_valid;
alter table public.documents drop constraint if exists documents_original_filename_valid;
alter table public.documents drop constraint if exists documents_storage_bucket_valid;
alter table public.documents drop constraint if exists documents_storage_bucket_path_key;
alter table public.documents drop constraint if exists documents_document_type_valid;
alter table public.documents drop constraint if exists documents_processing_status_valid;
alter table public.documents drop constraint if exists documents_upload_lifecycle_valid;

alter table public.documents
  add constraint documents_title_valid
    check (title = btrim(title) and char_length(title) between 1 and 160),
  add constraint documents_original_filename_valid
    check (original_filename = btrim(original_filename) and char_length(original_filename) between 1 and 128),
  add constraint documents_storage_bucket_valid
    check (storage_bucket = 'family-documents'),
  add constraint documents_storage_bucket_path_key unique (storage_bucket, storage_path),
  add constraint documents_mime_type_check
    check (mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    )),
  add constraint documents_file_size_check
    check (file_size > 0 and file_size <= 20971520),
  add constraint documents_document_type_valid
    check (document_type is null or document_type in ('education', 'health', 'legal', 'other')),
  add constraint documents_processing_status_valid
    check (processing_status in ('not_started', 'processing', 'ready', 'failed', 'deleted')),
  add constraint documents_upload_lifecycle_valid
    check ((upload_status = 'archived') = (deleted_at is not null));

create index if not exists documents_household_active_uploaded_idx
  on public.documents (household_id, created_at desc)
  where deleted_at is null and upload_status = 'uploaded';
create index if not exists documents_dependent_active_idx
  on public.documents (dependent_id, created_at desc)
  where dependent_id is not null and deleted_at is null;

-- Bucket configuration is versioned with the application rather than created by
-- hand in the dashboard. A bucket-level restriction is defense in depth; the
-- document table and upload action validate the same limits before signing.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'family-documents',
  'family-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.normalize_document_filename(raw_filename text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  candidate text := btrim(coalesce(raw_filename, ''));
  extension text;
  basename text;
  safe_basename text;
begin
  candidate := replace(candidate, E'\\', '/');
  candidate := regexp_replace(candidate, '^.*/', '');
  candidate := regexp_replace(candidate, '[[:cntrl:]]', '', 'g');
  extension := lower(coalesce(substring(candidate from E'\\.([A-Za-z0-9]{1,10})$'), ''));

  if extension not in ('pdf', 'docx', 'txt') then
    raise exception 'Unsupported document filename.' using errcode = '22023';
  end if;

  basename := regexp_replace(candidate, E'\\.[A-Za-z0-9]{1,10}$', '', 'i');
  safe_basename := trim(both '-' from regexp_replace(lower(basename), '[^a-z0-9]+', '-', 'g'));
  if safe_basename = '' then
    safe_basename := 'document';
  end if;

  return left(safe_basename, 120 - char_length(extension) - 1) || '.' || extension;
end;
$$;

create or replace function private.document_storage_path(
  target_household_id uuid,
  target_dependent_id uuid,
  target_document_id uuid,
  safe_filename text
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    'households/' || target_household_id::text ||
    '/dependents/' || coalesce(target_dependent_id::text, 'unassigned') ||
    '/documents/' || target_document_id::text ||
    '/' || safe_filename;
$$;

-- A household's soft deletion must revoke its member permissions just as a
-- removed membership does. The original helper predates soft-deletion-aware
-- document policies, so replace it here for every caller that relies on it.
create or replace function private.has_household_permission(
  target_household uuid,
  required_permissions public.household_permission[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.household_members as membership
    join public.households as household on household.id = membership.household_id
    where membership.household_id = target_household
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.permission = any(required_permissions)
      and household.deleted_at is null
  );
$$;

create or replace function private.document_dependent_matches_household(
  target_dependent_id uuid,
  target_household_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_dependent_id is null or exists (
    select 1
    from public.dependents as dependent
    where dependent.id = target_dependent_id
      and dependent.household_id = target_household_id
      and dependent.archived_at is null
  );
$$;

create or replace function private.document_storage_object_matches_metadata(
  target_bucket text,
  target_path text,
  target_file_size bigint,
  target_mime_type text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from storage.objects as object
    where object.bucket_id = target_bucket
      and object.name = target_path
      and case
        when coalesce(object.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (object.metadata ->> 'size')::bigint = target_file_size
        else false
      end
      and coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType', '') = target_mime_type
  );
$$;

create or replace function private.normalize_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_filename text;
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
      or new.processing_status is distinct from old.processing_status
      or new.created_at is distinct from old.created_at then
      raise exception 'Document identity and metadata cannot be changed after upload preparation.' using errcode = '42501';
    end if;

    if old.upload_status = 'archived' then
      raise exception 'Archived documents cannot be changed.' using errcode = '42501';
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
drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function private.set_updated_at();

-- Storage policies are tied to a pending/known document row and validate the
-- complete trusted path, rather than merely trusting a folder supplied by a
-- browser. The functions are security-definer helpers with an empty path to
-- avoid RLS recursion and search-path attacks.
create or replace function private.document_matches_storage_object(
  target_bucket text,
  target_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_bucket = 'family-documents' and exists (
    select 1
    from public.documents as document
    where document.storage_bucket = target_bucket
      and document.storage_path = target_name
      and target_name = private.document_storage_path(
        document.household_id,
        document.dependent_id,
        document.id,
        document.original_filename
      )
  );
$$;

create or replace function private.can_upload_family_document_object(
  target_bucket text,
  target_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.documents as document
    where document.storage_bucket = target_bucket
      and document.storage_path = target_name
      and document.upload_status = 'pending'
      and document.deleted_at is null
      and document.uploaded_by = auth.uid()
      and private.document_matches_storage_object(target_bucket, target_name)
      and private.has_household_permission(
        document.household_id,
        array['owner', 'administrator', 'member']::public.household_permission[]
      )
  );
$$;

create or replace function private.can_read_family_document_object(
  target_bucket text,
  target_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.documents as document
    where document.storage_bucket = target_bucket
      and document.storage_path = target_name
      and document.deleted_at is null
      and private.document_matches_storage_object(target_bucket, target_name)
      and (
        (
          document.upload_status = 'uploaded'
          and private.is_active_household_member(document.household_id)
        )
        or (
          document.upload_status in ('pending', 'failed')
          and document.uploaded_by = auth.uid()
          and private.has_household_permission(
            document.household_id,
            array['owner', 'administrator', 'member']::public.household_permission[]
          )
        )
      )
  );
$$;

alter table public.documents enable row level security;
alter table public.documents force row level security;
drop policy if exists documents_access on public.documents;
drop policy if exists documents_member_write on public.documents;
drop policy if exists documents_member_update on public.documents;
drop policy if exists documents_select_active_members on public.documents;
drop policy if exists documents_insert_non_viewer_members on public.documents;
drop policy if exists documents_update_authorized_archivers on public.documents;

create policy documents_select_active_members
  on public.documents for select to authenticated
  using (
    (deleted_at is null and private.is_active_household_member(household_id))
    or private.has_household_permission(
      household_id,
      array['owner', 'administrator']::public.household_permission[]
    )
    or (
      uploaded_by = auth.uid()
      and private.has_household_permission(
        household_id,
        array['owner', 'administrator', 'member']::public.household_permission[]
      )
    )
  );

create policy documents_insert_non_viewer_members
  on public.documents for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and storage_bucket = 'family-documents'
    and upload_status = 'pending'
    and processing_status = 'not_started'
    and deleted_at is null
    and private.has_household_permission(
      household_id,
      array['owner', 'administrator', 'member']::public.household_permission[]
    )
  );

create policy documents_update_authorized_archivers
  on public.documents for update to authenticated
  using (
    deleted_at is null
    and (
      private.has_household_permission(
        household_id,
        array['owner', 'administrator']::public.household_permission[]
      )
      or (
        uploaded_by = auth.uid()
        and private.has_household_permission(
          household_id,
          array['owner', 'administrator', 'member']::public.household_permission[]
        )
      )
    )
  )
  with check (
    private.has_household_permission(
      household_id,
      array['owner', 'administrator', 'member']::public.household_permission[]
    )
  );

revoke all on table public.documents from anon;
revoke all on table public.documents from authenticated;
grant select, insert, update on table public.documents to authenticated;

drop policy if exists family_documents_read on storage.objects;
drop policy if exists family_documents_insert_pending on storage.objects;
create policy family_documents_read
  on storage.objects for select to authenticated
  using (private.can_read_family_document_object(bucket_id, name));
create policy family_documents_insert_pending
  on storage.objects for insert to authenticated
  with check (private.can_upload_family_document_object(bucket_id, name));

revoke all on function private.normalize_document_filename(text) from public, anon;
revoke all on function private.document_storage_path(uuid, uuid, uuid, text) from public, anon;
revoke all on function private.document_dependent_matches_household(uuid, uuid) from public, anon;
revoke all on function private.document_storage_object_matches_metadata(text, text, bigint, text) from public, anon;
revoke all on function private.normalize_document() from public, anon;
revoke all on function private.document_matches_storage_object(text, text) from public, anon;
revoke all on function private.can_upload_family_document_object(text, text) from public, anon;
revoke all on function private.can_read_family_document_object(text, text) from public, anon;
grant execute on function private.can_upload_family_document_object(text, text) to authenticated;
grant execute on function private.can_read_family_document_object(text, text) to authenticated;
