begin;

select plan(44);

-- Synthetic users only. The Auth trigger creates the profiles referenced by
-- households and documents below.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'document-owner@example.test', 'not-a-real-password', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'document-admin@example.test', 'not-a-real-password', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'document-member@example.test', 'not-a-real-password', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'document-viewer@example.test', 'not-a-real-password', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'document-outsider@example.test', 'not-a-real-password', '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('60000000-0000-0000-0000-000000000001', 'Document test household', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', 'Other document household', '50000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000005');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'owner', 'active', now()),
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'administrator', 'active', now()),
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'member', 'active', now()),
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', 'viewer', 'active', now()),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000005', 'owner', 'active', now());

select has_table('public', 'documents', 'documents table exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.documents'::regclass), 'documents RLS is enabled and forced');
select has_column('public', 'documents', 'storage_bucket', 'documents record their storage bucket');
select has_column('public', 'documents', 'upload_status', 'documents record their upload lifecycle');
select is((select public from storage.buckets where id = 'family-documents'), false, 'family-documents is private');
select is((select file_size_limit from storage.buckets where id = 'family-documents'), 20971520::bigint, 'family-documents enforces the 20 MB project limit');

-- Establish a dependent in the other household to prove the document trigger
-- rejects cross-household assignment without trusting client metadata.
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000005';
insert into public.dependents (id, household_id, first_name)
values ('80000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Other household dependent');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
select lives_ok(
  $$insert into public.documents (id, household_id, uploaded_by, title, original_filename, storage_bucket, storage_path, mime_type, file_size, document_type, processing_status, upload_status, created_at, updated_at)
    values ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', ' Owner document ', '../School Report.PDF', 'browser-controlled', 'browser-controlled/path.pdf', 'application/pdf', 1024, 'education', 'ready', 'uploaded', '2000-01-01'::timestamptz, '2000-01-01'::timestamptz)$$,
  'owner can create pending document metadata'
);
select is((select uploaded_by from public.documents where title = 'Owner document'), '50000000-0000-0000-0000-000000000001'::uuid, 'uploader is derived from the authenticated caller');
select is((select storage_bucket from public.documents where title = 'Owner document'), 'family-documents', 'storage bucket is server-derived');
select ok((select storage_path <> 'browser-controlled/path.pdf' and storage_path like 'households/60000000-0000-0000-0000-000000000001/dependents/unassigned/documents/%/school-report.pdf' from public.documents where title = 'Owner document'), 'storage path is server-generated and cannot be client-controlled');
select is((select original_filename from public.documents where title = 'Owner document'), 'school-report.pdf', 'filename is normalized before persistence');
select ok((select created_at > now() - interval '1 minute' and updated_at > now() - interval '1 minute' from public.documents where title = 'Owner document'), 'document audit timestamps are server-assigned');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';
select lives_ok(
  $$insert into public.documents (household_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
    values ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Administrator document', 'plan.docx', 'ignored', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1024, 'health')$$,
  'household administrator can create pending document metadata'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000003';
select lives_ok(
  $$insert into public.documents (household_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
    values ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Member document', 'notes.txt', 'ignored', 'text/plain', 1024, 'other')$$,
  'ordinary member can create pending document metadata'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';
select throws_ok(
  $$update public.documents set upload_status = 'failed' where title = 'Member document'$$,
  '42501', null, 'manager cannot mark another uploader''s pending document failed'
);
select throws_ok(
  $$update public.documents set upload_status = 'uploaded' where title = 'Member document'$$,
  '42501', null, 'manager cannot finalize another uploader''s pending document'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000004';
select throws_ok(
  $$insert into public.documents (household_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
    values ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', 'Viewer document', 'viewer.txt', 'ignored', 'text/plain', 1024, 'other')$$,
  '42501', null, 'viewer cannot create document metadata'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000005';
select throws_ok(
  $$insert into public.documents (household_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
    values ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'Cross household document', 'cross.txt', 'ignored', 'text/plain', 1024, 'other')$$,
  '42501', null, 'unrelated household cannot create document metadata'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
select throws_ok(
  $$insert into public.documents (household_id, dependent_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
    values ('60000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Mismatched dependent', 'mismatch.txt', 'ignored', 'text/plain', 1024, 'other')$$,
  '23514', null, 'dependent must belong to the document household'
);
select throws_ok(
  $$update public.documents set storage_path = 'households/other/path.txt' where title = 'Owner document'$$,
  '42501', null, 'storage path cannot be changed after preparation'
);
select throws_ok(
  $$update public.documents set household_id = '60000000-0000-0000-0000-000000000002' where title = 'Owner document'$$,
  '42501', null, 'household cannot be reassigned after preparation'
);
select throws_ok(
  $$update public.documents set id = '70000000-0000-0000-0000-000000000099' where title = 'Owner document'$$,
  '42501', null, 'document identity cannot be changed after preparation'
);
select throws_ok(
  $$update public.documents set created_at = created_at + interval '1 day' where title = 'Owner document'$$,
  '42501', null, 'document creation timestamp cannot be changed after preparation'
);
select throws_ok(
  $$update public.documents set upload_status = 'uploaded' where title = 'Owner document'$$,
  '42501', null, 'a document cannot be marked uploaded before Storage metadata is verified'
);

insert into public.dependents (id, household_id, first_name)
values ('80000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Linked dependent');
insert into public.documents (household_id, dependent_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
values ('60000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'Dependent document', 'linked.txt', 'ignored', 'text/plain', 1024, 'other');
reset role;
select throws_ok(
  $$delete from public.dependents where id = '80000000-0000-0000-0000-000000000002'$$,
  '23503', null, 'a dependent linked to a document cannot be hard-deleted'
);

-- Create one synthetic Storage metadata row as the database owner. It represents
-- the object written by Storage; no real file body is created by this test.
reset role;
insert into storage.objects (bucket_id, name, metadata)
select storage_bucket, storage_path, jsonb_build_object('size', 1024, 'mimetype', 'application/pdf')
from public.documents
where title = 'Owner document';

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
select is((select count(*) from storage.objects), 1::bigint, 'original non-viewer uploader can inspect its pending object for completion verification');
select lives_ok(
  $$update public.documents set upload_status = 'uploaded' where title = 'Owner document'$$,
  'owner can mark a verified pending document uploaded'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000003';
select is((select count(*) from public.documents where title = 'Owner document' and upload_status = 'uploaded'), 1::bigint, 'active household member can read uploaded document metadata');
select is((select count(*) from storage.objects), 1::bigint, 'active household member can read the uploaded private object');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000005';
select is((select count(*) from public.documents where household_id = '60000000-0000-0000-0000-000000000001'), 0::bigint, 'unrelated household cannot read document metadata');
select is((select count(*) from storage.objects), 0::bigint, 'unrelated household cannot read private storage objects');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata) values ('family-documents', 'households/60000000-0000-0000-0000-000000000001/dependents/unassigned/documents/not-a-document/other.txt', '{}'::jsonb)$$,
  '42501', null, 'storage policies prevent cross-household or arbitrary object paths'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000004';
select lives_ok(
  $$update public.documents set upload_status = 'archived', deleted_at = now() where title = 'Owner document'$$,
  'viewer archive attempt is filtered by RLS'
);
select is((select upload_status::text from public.documents where title = 'Owner document'), 'uploaded', 'viewer cannot archive a document');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';
select lives_ok(
  $$update public.documents set upload_status = 'archived', deleted_at = now() where title = 'Administrator document'$$,
  'household administrator can archive a document'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000003';
select lives_ok(
  $$update public.documents set upload_status = 'archived', deleted_at = now() where title = 'Member document'$$,
  'original active non-viewer uploader can archive a document'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
select lives_ok(
  $$update public.documents set upload_status = 'archived', deleted_at = '2000-01-01'::timestamptz where title = 'Owner document'$$,
  'owner can archive an uploaded document'
);
select ok((select deleted_at > now() - interval '1 minute' from public.documents where title = 'Owner document'), 'archive timestamp is server-assigned');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000003';
select is((select count(*) from public.documents where upload_status = 'uploaded' and deleted_at is null), 0::bigint, 'archived documents are excluded from active uploaded queries');

reset role;
update public.household_members
set status = 'removed'
where household_id = '60000000-0000-0000-0000-000000000001'
  and user_id = '50000000-0000-0000-0000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000003';
select is((select count(*) from public.documents), 0::bigint, 'removed membership loses document metadata access immediately');
select is((select count(*) from storage.objects), 0::bigint, 'removed membership loses private storage access immediately');

reset role;
update public.households set deleted_at = now() where id = '60000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
select throws_ok(
  $$insert into public.documents (household_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
    values ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Deleted household document', 'deleted.txt', 'ignored', 'text/plain', 1024, 'other')$$,
  '42501', null, 'soft-deleted household cannot receive pending document metadata'
);

reset role;
set local role anon;
select throws_ok($$select * from public.documents$$, '42501', null, 'anonymous users cannot read document metadata');
select is((select count(*) from storage.objects where bucket_id = 'family-documents'), 0::bigint, 'anonymous users cannot read the private bucket');

select * from finish();
rollback;
