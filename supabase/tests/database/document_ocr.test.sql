begin;
select plan(50);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ocr-owner@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ocr-member@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ocr-administrator@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'ocr-viewer@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'ocr-removed@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'ocr-outsider@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('a2000000-0000-0000-0000-000000000001', 'OCR test household', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002', 'Other OCR household', 'a1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000006');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'owner', 'active', now()),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'member', 'active', now()),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'administrator', 'active', now()),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'viewer', 'active', now()),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'member', 'removed', now()),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000006', 'owner', 'active', now());

select has_table('public', 'document_ocr_jobs', 'OCR jobs table exists');
select has_column('public', 'document_ocr_jobs', 'document_id', 'OCR jobs have a parent document');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.document_ocr_jobs'::regclass), 'OCR job RLS is enabled and forced');
select has_function('public', 'queue_document_ocr', array['uuid'], 'OCR queue function exists');
select has_function('public', 'get_document_ocr_status', array['uuid'], 'safe OCR status function exists');
select has_function('public', 'claim_next_document_ocr_job', array['text'], 'OCR claim function exists');
select has_function('public', 'complete_document_ocr_job', array['uuid', 'text', 'text', 'text', 'jsonb', 'jsonb'], 'OCR completion function exists');
select has_function('public', 'fail_document_ocr_job', array['uuid', 'text', 'text'], 'OCR failure function exists');

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
insert into public.documents (household_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'OCR document', 'ocr-document.pdf', 'ignored', 'application/pdf', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Member OCR', 'member-ocr.pdf', 'ignored', 'application/pdf', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Administrator OCR', 'administrator-ocr.pdf', 'ignored', 'application/pdf', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Retry OCR', 'retry-ocr.pdf', 'ignored', 'application/pdf', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Completed OCR', 'completed-ocr.pdf', 'ignored', 'application/pdf', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Archived OCR', 'archived-ocr.pdf', 'ignored', 'application/pdf', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Archive after queue', 'archive-after-queue.pdf', 'ignored', 'application/pdf', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Non PDF OCR', 'non-pdf-ocr.txt', 'ignored', 'text/plain', 1024, 'other');
reset role;

insert into storage.objects (bucket_id, name, metadata)
select storage_bucket, storage_path, jsonb_build_object('size', file_size, 'mimetype', mime_type)
from public.documents
where household_id = 'a2000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
update public.documents set upload_status = 'uploaded'
where household_id = 'a2000000-0000-0000-0000-000000000001';
reset role;

do $$
declare target_id uuid;
begin
  for target_id in
    select id from public.documents
    where title in ('OCR document', 'Member OCR', 'Administrator OCR', 'Retry OCR', 'Archived OCR', 'Archive after queue')
  loop
    perform private.transition_document_processing_status(target_id, 'queued');
    perform private.transition_document_processing_status(target_id, 'processing');
    perform private.transition_document_processing_status(target_id, 'needs_ocr');
  end loop;
  select id into target_id from public.documents where title = 'Completed OCR';
  perform private.transition_document_processing_status(target_id, 'queued');
  perform private.transition_document_processing_status(target_id, 'processing');
  perform private.transition_document_processing_status(target_id, 'completed');
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
update public.documents set upload_status = 'archived' where title = 'Archived OCR';
reset role;

set local role anon;
select throws_ok($$select * from public.document_ocr_jobs$$, '42501', null, 'anonymous users cannot read OCR jobs');
select throws_ok($$select * from public.get_document_ocr_status('00000000-0000-0000-0000-000000000000'::uuid)$$, '42501', null, 'anonymous users cannot invoke OCR status');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000004';
select throws_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'OCR document'))$$, '42501', null, 'a viewer cannot request OCR');
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000006';
select throws_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'OCR document'))$$, '42501', null, 'an unrelated user cannot request OCR');
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000005';
select throws_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'OCR document'))$$, '42501', null, 'a removed member cannot request OCR');
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'OCR document'))$$, 'an owner can request OCR');
select ok((select already_queued from public.queue_document_ocr((select id from public.documents where title = 'OCR document'))), 'duplicate active OCR request is idempotent');
reset role;
select is((select count(*) from public.document_ocr_jobs where document_id = (select id from public.documents where title = 'OCR document')), 1::bigint, 'only one OCR job exists per document');

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok($$select * from public.claim_next_document_ocr_job('synthetic-ocr-worker-one')$$, 'the service worker can atomically claim OCR');
reset role;
select is((select status from public.document_ocr_jobs where document_id = (select id from public.documents where title = 'OCR document')), 'processing', 'claiming marks OCR processing');
select is((select attempt_count from public.document_ocr_jobs where document_id = (select id from public.documents where title = 'OCR document')), 1, 'claiming increments OCR attempts');
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is((select count(*) from public.claim_next_document_ocr_job('synthetic-ocr-worker-two')), 0::bigint, 'a claimed OCR job cannot be claimed twice');
select is(
  public.complete_document_ocr_job(
    (select id from public.document_ocr_jobs where document_id = (select id from public.documents where title = 'OCR document')),
    'different-worker', 'openai', 'synthetic-vision-model',
    '[{"page_number":1,"content":"የቤተሰብ ማጠቃለያ. Resumen familiar.","character_count":30}]'::jsonb,
    '[{"page_number":1,"chunk_index":0,"content":"የቤተሰብ ማጠቃለያ. Resumen familiar.","character_count":30,"token_estimate":5}]'::jsonb
  ), false, 'a different worker cannot complete OCR'
);
select ok(
  public.complete_document_ocr_job(
    (select id from public.document_ocr_jobs where document_id = (select id from public.documents where title = 'OCR document')),
    'synthetic-ocr-worker-one', 'openai', 'synthetic-vision-model',
    '[{"page_number":1,"content":"የቤተሰብ ማጠቃለያ. Resumen familiar.","character_count":30}]'::jsonb,
    '[{"page_number":1,"chunk_index":0,"content":"የቤተሰብ ማጠቃለያ. Resumen familiar.","character_count":30,"token_estimate":5}]'::jsonb
  ), 'the claiming worker atomically stores OCR output'
);
reset role;
select is((select processing_status from public.documents where title = 'OCR document'), 'completed', 'usable OCR transitions needs_ocr to completed');
select is((select count(*) from public.document_pages where document_id = (select id from public.documents where title = 'OCR document')), 1::bigint, 'OCR stores page output');
select is((select count(*) from public.document_chunks where document_id = (select id from public.documents where title = 'OCR document')), 1::bigint, 'OCR stores deterministic chunk output');
select is((select status from public.document_ocr_jobs where document_id = (select id from public.documents where title = 'OCR document')), 'completed', 'completed OCR jobs are terminal');

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';
select lives_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'Member OCR'))$$, 'an active member can request OCR');
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
select lives_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'Administrator OCR'))$$, 'an active household administrator can request OCR');
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select throws_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'Non PDF OCR'))$$, '42501', null, 'non-PDF documents cannot be queued for OCR');
select throws_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'Completed OCR'))$$, '42501', null, 'completed documents cannot be queued for OCR');
select throws_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'Archived OCR'))$$, '42501', null, 'archived documents cannot be queued for OCR');
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';
select throws_ok($$select * from public.document_ocr_jobs$$, '42501', null, 'normal users cannot read OCR jobs');
select throws_ok($$insert into public.document_pages (document_id, page_number, extracted_text, character_count) values ((select id from public.documents where title = 'Member OCR'), 1, 'forbidden', 9)$$, '42501', null, 'normal users cannot write OCR pages');
select throws_ok($$insert into public.document_chunks (document_id, page_number, chunk_index, content, character_count) values ((select id from public.documents where title = 'Member OCR'), 1, 0, 'forbidden', 9)$$, '42501', null, 'normal users cannot write OCR chunks');
select throws_ok($$select * from public.claim_next_document_ocr_job('browser-worker')$$, '42501', null, 'normal users cannot claim OCR jobs');
reset role;

update public.document_ocr_jobs set available_at = now() + interval '1 hour' where document_id in (select id from public.documents where title in ('Member OCR', 'Administrator OCR'));
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'Retry OCR'))$$, 'a retryable OCR document can be queued');
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok($$select * from public.claim_next_document_ocr_job('synthetic-ocr-retry-one')$$, 'the first OCR retry attempt can be claimed');
select ok(public.fail_document_ocr_job((select id from public.document_ocr_jobs where document_id = (select id from public.documents where title = 'Retry OCR')), 'synthetic-ocr-retry-one', 'ocr_output_empty'), 'empty OCR output fails safely');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'Retry OCR'))$$, 'a failed OCR job can be requeued');
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok($$select * from public.claim_next_document_ocr_job('synthetic-ocr-retry-two')$$, 'the second OCR attempt can be claimed');
select ok(public.fail_document_ocr_job((select id from public.document_ocr_jobs where document_id = (select id from public.documents where title = 'Retry OCR')), 'synthetic-ocr-retry-two', 'ocr_provider_failed'), 'a provider failure remains safe');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'Retry OCR'))$$, 'the final OCR attempt can be queued');
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok($$select * from public.claim_next_document_ocr_job('synthetic-ocr-retry-three')$$, 'the final OCR attempt can be claimed');
select ok(public.fail_document_ocr_job((select id from public.document_ocr_jobs where document_id = (select id from public.documents where title = 'Retry OCR')), 'synthetic-ocr-retry-three', 'ocr_timeout'), 'a timeout failure remains safe');
reset role;
select is((select attempt_count from public.document_ocr_jobs where document_id = (select id from public.documents where title = 'Retry OCR')), 3, 'OCR attempts are bounded');
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select throws_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'Retry OCR'))$$, '22023', null, 'OCR cannot exceed its attempt limit');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000006';
select is((select count(*) from public.document_pages where document_id = (select id from public.documents where title = 'OCR document')), 0::bigint, 'OCR output remains household scoped');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.queue_document_ocr((select id from public.documents where title = 'Archive after queue'))$$, 'an OCR request can be queued before archive');
select lives_ok($$update public.documents set upload_status = 'archived' where title = 'Archive after queue'$$, 'archiving an OCR document succeeds');
reset role;
select is((select status from public.document_ocr_jobs where document_id = (select id from public.documents where title = 'Archive after queue')), 'cancelled', 'archiving cancels active OCR work');

select * from finish();
rollback;
