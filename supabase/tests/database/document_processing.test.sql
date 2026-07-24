begin;

select plan(84);

-- Synthetic identities only. Auth synchronization creates the related profile
-- rows; this suite never stores real document data or credentials.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'processing-owner@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'processing-member@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'processing-viewer@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'processing-outsider@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('92000000-0000-0000-0000-000000000001', 'Processing test household', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001'),
  ('92000000-0000-0000-0000-000000000002', 'Other processing household', '91000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000004');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'owner', 'active', now()),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'member', 'active', now()),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', 'viewer', 'active', now()),
  ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000004', 'owner', 'active', now());

select has_table('public', 'document_processing_jobs', 'processing jobs table exists');
select has_column('public', 'document_processing_jobs', 'document_id', 'processing jobs belong to one document');
select has_column('public', 'document_processing_jobs', 'attempt_count', 'processing jobs track bounded attempts');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.document_processing_jobs'::regclass), 'processing-job RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.document_pages'::regclass), 'document-page RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.document_chunks'::regclass), 'document-chunk RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.document_analyses'::regclass), 'dormant analyses RLS is enabled and forced');
select has_function('public', 'queue_document_processing', array['uuid'], 'queue function exists');
select has_function('public', 'get_document_processing_status', array['uuid'], 'safe status function exists');
select has_function('public', 'claim_next_document_processing_job', array['text'], 'worker claim function exists');
select has_function('public', 'complete_document_processing_job', array['uuid', 'text', 'text', 'jsonb', 'jsonb'], 'worker completion function exists');
select has_function('public', 'fail_document_processing_job', array['uuid', 'text', 'text'], 'worker failure function exists');

-- Create uploaded and failed TXT rows through the normal authenticated preparation
-- path, then create matching synthetic Storage metadata as the database owner.
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
insert into public.documents (household_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Queue document', 'queue.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Retry document', 'retry.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Archive document', 'archive.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Future document', 'future.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Failed upload document', 'failed-upload.txt', 'ignored', 'text/plain', 1024, 'other');

reset role;
insert into storage.objects (bucket_id, name, metadata)
select storage_bucket, storage_path, jsonb_build_object('size', file_size, 'mimetype', mime_type)
from public.documents
where household_id = '92000000-0000-0000-0000-000000000001'
  and title <> 'Failed upload document';

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
update public.documents
set upload_status = 'uploaded'
where household_id = '92000000-0000-0000-0000-000000000001'
  and title <> 'Failed upload document';
update public.documents
set upload_status = 'failed'
where title = 'Failed upload document';
select set_config(
  'app.document_processing_test_queue_id',
  (select id::text from public.documents where title = 'Queue document'),
  true
);

select throws_ok(
  $$update public.documents set processing_status = 'queued' where title = 'Queue document'$$,
  '42501',
  null,
  'an owner cannot directly change processing status'
);
select throws_ok(
  $$select * from public.queue_document_processing((select id from public.documents where title = 'Failed upload document'))$$,
  '42501',
  null,
  'a failed upload cannot be queued'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000003';
select throws_ok(
  $$select * from public.queue_document_processing((select id from public.documents where title = 'Queue document'))$$,
  '42501',
  null,
  'a viewer cannot queue document processing'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000004';
select throws_ok(
  $$select * from public.queue_document_processing(current_setting('app.document_processing_test_queue_id')::uuid)$$,
  '42501',
  null,
  'an unrelated user cannot queue document processing'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000002';
select throws_ok($$select * from public.document_processing_jobs$$, '42501', null, 'a member cannot query job internals');
select throws_ok(
  $$update public.document_processing_jobs set status = 'failed'$$,
  '42501',
  null,
  'a member cannot update processing jobs directly'
);
select throws_ok(
  $$insert into public.document_pages (document_id, page_number, extracted_text, character_count)
      values ((select id from public.documents where title = 'Queue document'), 1, 'forbidden', 9)$$,
  '42501',
  null,
  'a member cannot write extracted pages directly'
);
select throws_ok(
  $$insert into public.document_chunks (document_id, page_number, chunk_index, content, character_count)
      values ((select id from public.documents where title = 'Queue document'), 1, 0, 'forbidden', 9)$$,
  '42501',
  null,
  'a member cannot write extracted chunks directly'
);
select throws_ok(
  $$select * from public.claim_next_document_processing_job('ordinary-browser-caller')$$,
  '42501',
  null,
  'a normal authenticated caller cannot claim a worker job'
);

reset role;
set local role anon;
select throws_ok($$select * from public.document_processing_jobs$$, '42501', null, 'an anonymous user cannot query processing jobs');
select throws_ok($$select * from public.document_pages$$, '42501', null, 'an anonymous user cannot read extracted pages');
select throws_ok($$select * from public.document_chunks$$, '42501', null, 'an anonymous user cannot read extracted chunks');
select throws_ok($$select * from public.document_analyses$$, '42501', null, 'an anonymous user cannot read dormant analyses');
select throws_ok(
  $$select * from public.get_document_processing_status('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501',
  null,
  'an anonymous user cannot invoke the safe status function'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';

select lives_ok(
  $$select * from public.queue_document_processing((select id from public.documents where title = 'Queue document'))$$,
  'an owner can queue an uploaded active document'
);
select is((select processing_status from public.documents where title = 'Queue document'), 'queued', 'queueing changes the document to queued');

reset role;
select is((select count(*) from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Queue document')), 1::bigint, 'queueing creates one job');

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select ok(
  (select already_queued from public.queue_document_processing((select id from public.documents where title = 'Queue document'))),
  'repeated queueing reports the existing active job'
);

reset role;
select is((select count(*) from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Queue document')), 1::bigint, 'repeated queueing does not create a duplicate job');

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok(
  $$select * from public.claim_next_document_processing_job('synthetic-worker-one')$$,
  'the service worker can atomically claim a queued job'
);

reset role;
select is((select status from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Queue document')), 'processing', 'claiming marks the job processing');
select is((select attempt_count from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Queue document')), 1, 'claiming increments the attempt count once');
select is((select processing_status from public.documents where title = 'Queue document'), 'processing', 'claiming marks the document processing');
select ok(
  (
    select locked_at is not null and locked_by = 'synthetic-worker-one' and started_at is not null
    from public.document_processing_jobs
    where document_id = (select id from public.documents where title = 'Queue document')
  ),
  'claiming records the worker lease and start timestamp'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is((select count(*) from public.claim_next_document_processing_job('synthetic-worker-two')), 0::bigint, 'a locked processing job cannot be claimed twice');
select is(
  public.complete_document_processing_job(
    (select id from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Queue document')),
    'different-worker',
    'completed',
    '[{"page_number":1,"content":"Synthetic extracted text.","character_count":25}]'::jsonb,
    '[{"page_number":1,"chunk_index":0,"content":"Synthetic extracted text.","character_count":25,"token_estimate":5}]'::jsonb
  ),
  false,
  'a different worker cannot complete a claimed job'
);
select throws_ok(
  $$select public.complete_document_processing_job(
      (select id from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Queue document')),
      'synthetic-worker-one',
      'completed',
      jsonb_build_array(jsonb_build_object('page_number', 1, 'content', repeat('x', 1201), 'character_count', 1201)),
      jsonb_build_array(jsonb_build_object('page_number', 1, 'chunk_index', 0, 'content', repeat('x', 1201), 'character_count', 1201, 'token_estimate', 1))
    )$$,
  '23514',
  null,
  'the completion boundary rejects an oversized chunk'
);
select ok(
  public.complete_document_processing_job(
    (select id from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Queue document')),
    'synthetic-worker-one',
    'completed',
    '[{"page_number":1,"content":"Synthetic extracted text.","character_count":25}]'::jsonb,
    '[{"page_number":1,"chunk_index":0,"content":"Synthetic extracted text.","character_count":25,"token_estimate":5}]'::jsonb
  ),
  'the claiming worker can atomically persist completed output'
);

reset role;
select is((select status from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Queue document')), 'completed', 'completion marks the job terminal');
select is((select processing_status from public.documents where title = 'Queue document'), 'completed', 'completion marks the document completed');
select is((select count(*) from public.document_pages where document_id = (select id from public.documents where title = 'Queue document')), 1::bigint, 'completion stores one bounded page');
select is((select count(*) from public.document_chunks where document_id = (select id from public.documents where title = 'Queue document')), 1::bigint, 'completion stores one bounded chunk');

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is((select count(*) from public.claim_next_document_processing_job('synthetic-worker-after-completion')), 0::bigint, 'a completed job is never claimed again');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select * from public.queue_document_processing((select id from public.documents where title = 'Future document'))$$,
  'an eligible document can be queued for a future worker pass'
);
reset role;
update public.document_processing_jobs
set available_at = now() + interval '1 hour'
where document_id = (select id from public.documents where title = 'Future document');
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is((select count(*) from public.claim_next_document_processing_job('synthetic-worker-before-available')), 0::bigint, 'a future queued job is skipped');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000002';
select is((select count(*) from public.document_pages where document_id = (select id from public.documents where title = 'Queue document')), 1::bigint, 'an active member can read authorized extracted pages');
select is((select count(*) from public.document_chunks where document_id = (select id from public.documents where title = 'Queue document')), 1::bigint, 'an active member can read authorized extracted chunks');

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000003';
select is((select count(*) from public.document_pages where document_id = (select id from public.documents where title = 'Queue document')), 1::bigint, 'an active viewer inherits parent-document extraction access');

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000004';
select is((select count(*) from public.document_pages where document_id = current_setting('app.document_processing_test_queue_id')::uuid), 0::bigint, 'an unrelated household cannot read extracted pages');
select is((select count(*) from public.document_chunks where document_id = current_setting('app.document_processing_test_queue_id')::uuid), 0::bigint, 'an unrelated household cannot read extracted chunks');
select is((select count(*) from public.get_document_processing_status(current_setting('app.document_processing_test_queue_id')::uuid)), 0::bigint, 'an unrelated household receives no processing status');

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000002';
select is((select status from public.get_document_processing_status((select id from public.documents where title = 'Queue document'))), 'completed', 'an active member receives only the safe processing status surface');

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select * from public.queue_document_processing((select id from public.documents where title = 'Queue document'))$$,
  '22023',
  null,
  'a completed document cannot be requeued'
);

select lives_ok(
  $$select * from public.queue_document_processing((select id from public.documents where title = 'Retry document'))$$,
  'a failed document test can be queued initially'
);

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok(
  $$select * from public.claim_next_document_processing_job('synthetic-retry-worker-one')$$,
  'the service worker can claim the retry test document'
);
select ok(
  public.fail_document_processing_job(
    (select id from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Retry document')),
    'synthetic-retry-worker-one',
    'text_extraction_failed'
  ),
  'the claiming worker can record a whitelisted processing failure'
);

reset role;
select is((select processing_status from public.documents where title = 'Retry document'), 'failed', 'a worker failure marks the document failed');
select is((select error_code from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Retry document')), 'text_extraction_failed', 'only the safe failure code is persisted');
select is((select error_message from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Retry document')), 'Document processing could not extract text.', 'the persisted failure message is generic and contains no parser detail');

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select ok(
  (select retryable from public.get_document_processing_status((select id from public.documents where title = 'Retry document'))),
  'the safe status surface reports a failed job below the retry limit as retryable'
);
select lives_ok(
  $$select * from public.queue_document_processing((select id from public.documents where title = 'Retry document'))$$,
  'an owner can retry a failed document before the bounded limit'
);

reset role;
select is((select status from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Retry document')), 'queued', 'retry returns the existing job to queued');

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok(
  $$select * from public.claim_next_document_processing_job('synthetic-retry-worker-two')$$,
  'the service worker can claim the second retry attempt'
);
select ok(
  public.fail_document_processing_job(
    (select id from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Retry document')),
    'synthetic-retry-worker-two',
    'text_extraction_failed'
  ),
  'the second retry attempt can fail safely'
);

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select * from public.queue_document_processing((select id from public.documents where title = 'Retry document'))$$,
  'the final allowed retry can be queued'
);

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok(
  $$select * from public.claim_next_document_processing_job('synthetic-retry-worker-three')$$,
  'the service worker can claim the final allowed retry attempt'
);
select ok(
  public.fail_document_processing_job(
    (select id from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Retry document')),
    'synthetic-retry-worker-three',
    'text_extraction_failed'
  ),
  'the final retry attempt can fail safely'
);

reset role;
select is((select attempt_count from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Retry document')), 3, 'attempts stop at the configured maximum');

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select ok(
  not (select retryable from public.get_document_processing_status((select id from public.documents where title = 'Retry document'))),
  'the safe status surface suppresses retry after the maximum attempts'
);

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is((select count(*) from public.claim_next_document_processing_job('synthetic-worker-after-max-attempts')), 0::bigint, 'a job at the retry limit is never claimed again');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select * from public.queue_document_processing((select id from public.documents where title = 'Retry document'))$$,
  '22023',
  null,
  'a document cannot exceed the retry limit'
);

reset role;
update public.household_members
set status = 'removed'
where household_id = '92000000-0000-0000-0000-000000000001'
  and user_id = '91000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000002';
select is((select count(*) from public.document_pages where document_id = (select id from public.documents where title = 'Queue document')), 0::bigint, 'a removed member immediately loses extracted-page access');
select is((select count(*) from public.document_chunks where document_id = (select id from public.documents where title = 'Queue document')), 0::bigint, 'a removed member immediately loses extracted-chunk access');
select is((select count(*) from public.get_document_processing_status((select id from public.documents where title = 'Queue document'))), 0::bigint, 'a removed member immediately loses processing-status access');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select * from public.queue_document_processing((select id from public.documents where title = 'Archive document'))$$,
  'an uploaded document can be queued before an archive'
);
select lives_ok(
  $$update public.documents set upload_status = 'archived' where title = 'Archive document'$$,
  'archiving a queued document succeeds through the existing archive path'
);

reset role;
select is((select status from public.document_processing_jobs where document_id = (select id from public.documents where title = 'Archive document')), 'cancelled', 'archiving cancels an active queued job');

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select * from public.queue_document_processing((select id from public.documents where title = 'Archive document'))$$,
  '42501',
  null,
  'an archived document cannot be queued'
);
select lives_ok(
  $$update public.documents set upload_status = 'archived' where title = 'Queue document'$$,
  'an owner can archive a completed document'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000003';
select is((select count(*) from public.document_pages where document_id = (select id from public.documents where title = 'Queue document')), 0::bigint, 'archiving the parent immediately hides extracted pages');
select is((select count(*) from public.document_chunks where document_id = (select id from public.documents where title = 'Queue document')), 0::bigint, 'archiving the parent immediately hides extracted chunks');
select is((select count(*) from public.get_document_processing_status((select id from public.documents where title = 'Queue document'))), 0::bigint, 'archiving the parent immediately hides processing status');

select * from finish();
rollback;
