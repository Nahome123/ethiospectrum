begin;

select plan(76);

-- Synthetic identities only. The Auth trigger creates the related profiles;
-- no production documents, prompts, summaries, or credentials are used.
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
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'summary-owner@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'summary-admin@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'summary-member@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'summary-viewer@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'summary-outsider@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('a2000000-0000-0000-0000-000000000001', 'Summary test household', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002', 'Other summary household', 'a1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'owner', 'active', now()),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'administrator', 'active', now()),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'member', 'active', now()),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'viewer', 'active', now()),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000005', 'owner', 'active', now());

select has_table('public', 'document_summaries', 'document summaries table exists');
select has_column('public', 'document_summaries', 'document_id', 'summaries belong to documents');
select has_column('public', 'document_summaries', 'household_id', 'summaries record their household boundary');
select has_column('public', 'document_summaries', 'source_references', 'summaries store trusted source references');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.document_summaries'::regclass), 'summary RLS is enabled and forced');
select has_function('public', 'request_document_summary', array['uuid', 'text'], 'controlled summary request function exists');
select has_function('public', 'get_document_summary_status', array['uuid', 'text'], 'safe summary status function exists');
select has_function('public', 'claim_next_document_summary_job', array['text'], 'summary worker claim function exists');
select has_function('public', 'complete_document_summary_job', array['uuid', 'text', 'text', 'jsonb', 'jsonb', 'text', 'integer', 'integer', 'text', 'text', 'integer'], 'summary worker completion function exists');
select has_function('public', 'fail_document_summary_job', array['uuid', 'text', 'text'], 'summary worker failure function exists');
select ok(exists (select 1 from pg_constraint where conname = 'document_summaries_document_language_key'), 'one summary record exists per document and language');
select ok(has_table_privilege('service_role', 'public.documents', 'select'), 'the summary worker can revalidate its parent document');
select ok(has_table_privilege('service_role', 'public.document_pages', 'select'), 'the summary worker can read protected source pages');
select ok(has_table_privilege('service_role', 'public.document_chunks', 'select'), 'the summary worker can read protected source chunks');
select ok(has_table_privilege('service_role', 'public.document_processing_jobs', 'select'), 'the processing worker can inspect its protected job lifecycle');
select ok(has_table_privilege('service_role', 'public.document_summaries', 'select'), 'the summary worker can inspect its protected job lifecycle');

-- Use the normal document-preparation path, then construct only synthetic
-- extraction derivatives under the database owner for summary fixtures.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
insert into public.documents (household_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Summary target document', 'summary-target.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Other source document', 'other-source.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Retry summary document', 'retry-summary.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Archive summary document', 'archive-summary.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Incomplete summary document', 'incomplete-summary.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Needs OCR summary document', 'needs-ocr-summary.pdf', 'ignored', 'application/pdf', 1024, 'other');

reset role;
insert into storage.objects (bucket_id, name, metadata)
select storage_bucket, storage_path, jsonb_build_object('size', file_size, 'mimetype', mime_type)
from public.documents
where household_id = 'a2000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
update public.documents
set upload_status = 'uploaded'
where household_id = 'a2000000-0000-0000-0000-000000000001';

reset role;
do $$
declare
  target_document record;
  target_page_id uuid;
  synthetic_source text;
begin
  for target_document in
    select id, title
    from public.documents
    where title in (
      'Summary target document',
      'Other source document',
      'Retry summary document',
      'Archive summary document',
      'Needs OCR summary document'
    )
  loop
    perform private.transition_document_processing_status(target_document.id, 'queued');
    perform private.transition_document_processing_status(target_document.id, 'processing');

    if target_document.title = 'Needs OCR summary document' then
      perform private.transition_document_processing_status(target_document.id, 'needs_ocr');
    else
      synthetic_source := 'Synthetic source for ' || target_document.title || '.';
      insert into public.document_pages (document_id, page_number, extracted_text, character_count)
      values (target_document.id, 1, synthetic_source, char_length(synthetic_source))
      returning id into target_page_id;
      insert into public.document_chunks (
        document_id,
        page_id,
        page_number,
        chunk_index,
        content,
        character_count,
        token_estimate
      )
      values (
        target_document.id,
        target_page_id,
        1,
        0,
        synthetic_source,
        char_length(synthetic_source),
        8
      );
      perform private.transition_document_processing_status(target_document.id, 'completed');
    end if;
  end loop;
end;
$$;

select throws_ok(
  $$insert into public.document_summaries (document_id, household_id, language, requested_by)
      values (
        (select id from public.documents where title = 'Summary target document'),
        'a2000000-0000-0000-0000-000000000002',
        'en',
        'a1000000-0000-0000-0000-000000000001'
      )$$,
  '23514',
  null,
  'a summary household must match its parent document'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Summary target document'), 'en')$$,
  'an owner can request an eligible English summary'
);
select is(
  (select status from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  'queued',
  'a new eligible request is queued'
);
select is(
  (select household_id from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  'a2000000-0000-0000-0000-000000000001'::uuid,
  'the summary household is derived from its document'
);
select is(
  (select requested_by from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'the summary requester is derived from authentication'
);
select ok(
  (select already_active from public.request_document_summary((select id from public.documents where title = 'Summary target document'), 'en')),
  'a repeated active request reports the existing job'
);
select is(
  (select count(*) from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  1::bigint,
  'repeated active requests do not create duplicate summary rows'
);

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok(
  $$select * from public.claim_next_document_summary_job('synthetic-summary-worker-one')$$,
  'the summary worker atomically claims the queued job'
);
select is(
  (select status from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  'generating',
  'claiming marks a summary as generating'
);
select is(
  (select attempt_count from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  1,
  'claiming increments the summary attempt count once'
);
select is(
  (select count(*) from public.claim_next_document_summary_job('synthetic-summary-worker-two')),
  0::bigint,
  'a locked generating summary cannot be claimed twice'
);
select ok(
  public.complete_document_summary_job(
    (select id from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
    'synthetic-summary-worker-one',
    'Synthetic document overview.',
    jsonb_build_object(
      'overview', jsonb_build_object('text', 'Synthetic document overview.', 'sourceKeys', jsonb_build_array('src_001')),
      'keyPoints', '[]'::jsonb,
      'importantDates', '[]'::jsonb,
      'actionItems', '[]'::jsonb,
      'organizationsOrPeople', '[]'::jsonb,
      'warningsOrUncertainties', '[]'::jsonb
    ),
    jsonb_build_array(jsonb_build_object(
      'reference_id', 'source-1',
      'section', 'overview',
      'item_index', 0,
      'page_id', (select page.id from public.document_pages as page join public.documents as document on document.id = page.document_id where document.title = 'Summary target document'),
      'page_number', 1,
      'chunk_id', (select chunk.id from public.document_chunks as chunk join public.documents as document on document.id = chunk.document_id where document.title = 'Summary target document'),
      'chunk_index', 0,
      'excerpt', 'Synthetic source for Summary target document.'
    )),
    'full',
    1,
    45,
    'synthetic-provider',
    'synthetic-summary-model',
    1
  ),
  'the claimed worker can persist a valid source-grounded summary'
);
reset role;
select is(
  (select status from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  'completed',
  'completion marks the summary completed'
);
select is(
  (select source_references -> 0 ->> 'section' from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  'overview',
  'summary references preserve their structured-summary section'
);
select is(
  (select (source_references -> 0 ->> 'item_index')::integer from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  0,
  'summary references preserve their section item index'
);
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select is(
  (select status from public.get_document_summary_status((select id from public.documents where title = 'Summary target document'), 'en')),
  'completed',
  'the safe status RPC reports completion without worker metadata'
);
select ok(
  (select reused_completed from public.request_document_summary((select id from public.documents where title = 'Summary target document'), 'en')),
  'a completed summary is reused rather than regenerated'
);

select lives_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Retry summary document'), 'en')$$,
  'an owner can queue a second eligible summary for retry testing'
);
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok(
  $$select * from public.claim_next_document_summary_job('synthetic-summary-retry-one')$$,
  'the worker can claim the retry-test summary'
);
select throws_ok(
  $$select public.complete_document_summary_job(
      (select id from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Retry summary document')),
      'synthetic-summary-retry-one',
      'Synthetic retry overview.',
      jsonb_build_object(
        'overview', jsonb_build_object('text', 'Synthetic retry overview.', 'sourceKeys', jsonb_build_array('src_001', 'src_002')),
        'keyPoints', '[]'::jsonb,
        'importantDates', '[]'::jsonb,
        'actionItems', '[]'::jsonb,
        'organizationsOrPeople', '[]'::jsonb,
        'warningsOrUncertainties', '[]'::jsonb
      ),
      jsonb_build_array(jsonb_build_object(
        'reference_id', 'source-1',
        'section', 'overview',
        'item_index', 0,
        'page_id', (select page.id from public.document_pages as page join public.documents as document on document.id = page.document_id where document.title = 'Retry summary document'),
        'page_number', 1,
        'chunk_id', (select chunk.id from public.document_chunks as chunk join public.documents as document on document.id = chunk.document_id where document.title = 'Retry summary document'),
        'chunk_index', 0,
        'excerpt', 'Synthetic source for Retry summary document.'
      )),
      'full',
      1,
      42,
      'synthetic-provider',
      'synthetic-summary-model',
      1
    )$$,
  '22023',
  null,
  'a completed statement must preserve one reference for every declared source key'
);
select throws_ok(
  $$select public.complete_document_summary_job(
      (select id from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Retry summary document')),
      'synthetic-summary-retry-one',
      'Synthetic retry overview.',
      jsonb_build_object(
        'overview', jsonb_build_object('text', 'Synthetic retry overview.', 'sourceKeys', jsonb_build_array('src_001')),
        'keyPoints', '[]'::jsonb,
        'importantDates', '[]'::jsonb,
        'actionItems', '[]'::jsonb,
        'organizationsOrPeople', '[]'::jsonb,
        'warningsOrUncertainties', '[]'::jsonb
      ),
      jsonb_build_array(jsonb_build_object(
        'reference_id', 'source-1',
        'section', 'overview',
        'item_index', 0,
        'page_id', (select page.id from public.document_pages as page join public.documents as document on document.id = page.document_id where document.title = 'Other source document'),
        'page_number', 1,
        'chunk_id', (select chunk.id from public.document_chunks as chunk join public.documents as document on document.id = chunk.document_id where document.title = 'Other source document'),
        'chunk_index', 0,
        'excerpt', 'Synthetic source for Other source document.'
      )),
      'full',
      1,
      42,
      'synthetic-provider',
      'synthetic-summary-model',
      1
    )$$,
  '22023',
  null,
  'a summary cannot reference a page or chunk from another document'
);
select ok(
  public.fail_document_summary_job(
    (select id from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Retry summary document')),
    'synthetic-summary-retry-one',
    'source_validation_failed'
  ),
  'the worker can safely fail an invalid-source summary attempt'
);
reset role;
select is(
  (select status from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Retry summary document')),
  'failed',
  'an invalid-source attempt becomes a safe failed summary'
);
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Retry summary document'), 'en')$$,
  'a failed summary can be retried before the maximum'
);
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok(
  $$select * from public.claim_next_document_summary_job('synthetic-summary-retry-two')$$,
  'the worker can claim the second summary attempt'
);
select ok(
  public.fail_document_summary_job(
    (select id from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Retry summary document')),
    'synthetic-summary-retry-two',
    'provider_unavailable'
  ),
  'the second summary attempt can fail with a bounded safe code'
);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Retry summary document'), 'en')$$,
  'the final allowed retry can be queued'
);
reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok(
  $$select * from public.claim_next_document_summary_job('synthetic-summary-retry-three')$$,
  'the worker can claim the third summary attempt'
);
select ok(
  public.fail_document_summary_job(
    (select id from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Retry summary document')),
    'synthetic-summary-retry-three',
    'provider_request_rejected'
  ),
  'the final summary attempt can fail with a safe request-rejected code'
);
reset role;
select is(
  (select attempt_count from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Retry summary document')),
  3,
  'summary attempts stop at the configured maximum'
);
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is(
  (select count(*) from public.claim_next_document_summary_job('synthetic-summary-after-max')),
  0::bigint,
  'a summary at the retry limit is never claimed again'
);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Retry summary document'), 'en')$$,
  '22023',
  null,
  'a summary cannot exceed the retry limit'
);

set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';
select lives_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Summary target document'), 'es')$$,
  'a household administrator can request a summary'
);
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
select lives_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Summary target document'), 'am')$$,
  'a household member can request a summary'
);

-- A later worker invocation must free stale locks before taking a due job;
-- the queued Amharic summary may be claimed afterwards and is intentionally
-- not inspected by this lifecycle-specific assertion.
reset role;
update public.document_summaries
set
  status = 'generating',
  locked_at = now() - interval '16 minutes',
  locked_by = 'synthetic-stale-summary-worker',
  started_at = now() - interval '16 minutes'
where language = 'es'
  and document_id = (select id from public.documents where title = 'Summary target document');
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok(
  $$select * from public.claim_next_document_summary_job('synthetic-summary-stale-recovery')$$,
  'a worker invocation clears a stale generating summary lock'
);
reset role;
select is(
  (select status from public.document_summaries where language = 'es' and document_id = (select id from public.documents where title = 'Summary target document')),
  'failed',
  'a stale generating summary is moved to a safe failed state'
);
select is(
  (select error_code from public.document_summaries where language = 'es' and document_id = (select id from public.documents where title = 'Summary target document')),
  'worker_timeout',
  'stale-lock recovery stores only a safe timeout code'
);
select ok(
  (select locked_at is null and locked_by is null from public.document_summaries where language = 'es' and document_id = (select id from public.documents where title = 'Summary target document')),
  'stale-lock recovery releases worker lock metadata'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000004';
select throws_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Summary target document'), 'en')$$,
  '42501',
  null,
  'a viewer cannot request a summary'
);
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000005';
select throws_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Summary target document'), 'en')$$,
  '42501',
  null,
  'an unrelated household user cannot request a summary'
);
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
select throws_ok(
  $$insert into public.document_summaries (document_id, household_id, language, requested_by)
      values ((select id from public.documents where title = 'Summary target document'), 'a2000000-0000-0000-0000-000000000001', 'en', 'a1000000-0000-0000-0000-000000000003')$$,
  '42501',
  null,
  'a normal member cannot insert summaries directly'
);
select throws_ok(
  $$update public.document_summaries set status = 'failed' where true$$,
  '42501',
  null,
  'a normal member cannot update summary jobs directly'
);
select throws_ok(
  $$select * from public.claim_next_document_summary_job('ordinary-browser-caller')$$,
  '42501',
  null,
  'a normal member cannot claim a summary worker job'
);
select throws_ok(
  $$select public.complete_document_summary_job('00000000-0000-0000-0000-000000000000', 'ordinary-browser-caller', 'x', '{}'::jsonb, '[]'::jsonb, 'full', 1, 1, 'p', 'm', 1)$$,
  '42501',
  null,
  'a normal member cannot complete a summary worker job'
);
select throws_ok(
  $$select public.fail_document_summary_job('00000000-0000-0000-0000-000000000000', 'ordinary-browser-caller', 'provider_timeout')$$,
  '42501',
  null,
  'a normal member cannot fail a summary worker job'
);

set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000004';
select is(
  (select count(*) from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  1::bigint,
  'an active viewer can read an accessible completed summary'
);
select is(
  (select status from public.get_document_summary_status((select id from public.documents where title = 'Summary target document'), 'en')),
  'completed',
  'an active viewer can read the safe summary status'
);
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000005';
select is(
  (select count(*) from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  0::bigint,
  'an unrelated household cannot read a summary'
);
select is(
  (select count(*) from public.get_document_summary_status((select id from public.documents where title = 'Summary target document'), 'en')),
  0::bigint,
  'an unrelated household receives no summary status'
);

set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Incomplete summary document'), 'en')$$,
  '42501',
  null,
  'an incomplete document cannot be summarized'
);
select throws_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Needs OCR summary document'), 'en')$$,
  '42501',
  null,
  'a needs-OCR document cannot be summarized'
);
select lives_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Archive summary document'), 'en')$$,
  'an eligible document can have a queued summary before archive'
);
select lives_ok(
  $$update public.documents set upload_status = 'archived' where title = 'Archive summary document'$$,
  'archiving an eligible document succeeds through the existing archive path'
);
reset role;
select is(
  (select status from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Archive summary document')),
  'failed',
  'archiving releases queued summary work into a safe failed state'
);
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Archive summary document')),
  0::bigint,
  'an archived document summary is hidden through normal RLS reads'
);
select throws_ok(
  $$select * from public.request_document_summary((select id from public.documents where title = 'Archive summary document'), 'en')$$,
  '42501',
  null,
  'an archived document cannot be summarized'
);

reset role;
set local role anon;
select throws_ok(
  $$select * from public.document_summaries$$,
  '42501',
  null,
  'anonymous users cannot read summaries'
);
select throws_ok(
  $$select * from public.request_document_summary('00000000-0000-0000-0000-000000000000', 'en')$$,
  '42501',
  null,
  'anonymous users cannot request summaries'
);

reset role;
update public.household_members
set status = 'removed'
where household_id = 'a2000000-0000-0000-0000-000000000001'
  and user_id = 'a1000000-0000-0000-0000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
select is(
  (select count(*) from public.document_summaries where language = 'en' and document_id = (select id from public.documents where title = 'Summary target document')),
  0::bigint,
  'a removed member immediately loses summary read access'
);
select is(
  (select count(*) from public.get_document_summary_status((select id from public.documents where title = 'Summary target document'), 'en')),
  0::bigint,
  'a removed member immediately loses summary-status access'
);

select * from finish();
rollback;
