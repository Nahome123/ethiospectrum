begin;

select plan(43);

-- Synthetic identities only. No production documents, prompts, answers, or
-- credentials are present in this local pgTAP fixture.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'question-owner@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'question-member@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'question-viewer@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'question-outsider@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('b2000000-0000-0000-0000-000000000001', 'Question test household', 'b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001'),
  ('b2000000-0000-0000-0000-000000000002', 'Other question household', 'b1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000004');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'owner', 'active', now()),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'member', 'active', now()),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'viewer', 'active', now()),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000004', 'owner', 'active', now());

select has_table('public', 'document_questions', 'document questions table exists');
select has_column('public', 'document_questions', 'question_normalized', 'questions have an idempotency key');
select has_column('public', 'document_questions', 'source_references', 'questions store protected source references');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.document_questions'::regclass), 'question RLS is enabled and forced');
select has_function('public', 'request_document_question', array['uuid', 'text', 'text'], 'controlled question request function exists');
select has_function('public', 'get_document_question_status', array['uuid'], 'safe question status function exists');
select has_function('public', 'get_document_questions', array['uuid'], 'safe question read function exists');
select has_function('public', 'get_document_citation_evidence', array['uuid', 'text', 'uuid', 'integer'], 'safe citation evidence function exists');
select has_function('public', 'claim_next_document_question_job', array['text'], 'question claim function exists');
select has_function('public', 'complete_document_question_job', array['uuid', 'text', 'text', 'jsonb', 'text', 'integer', 'integer', 'text', 'text', 'integer'], 'question completion function exists');
select has_function('public', 'fail_document_question_job', array['uuid', 'text', 'text'], 'question failure function exists');
select ok(exists (select 1 from pg_constraint where conname = 'document_questions_document_language_normalized_key'), 'one normalized question exists per document and language');

-- Construct only synthetic processed documents and derivatives.
set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';
insert into public.documents (household_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Question target document', 'question-target.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Other question source', 'question-other.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Archive question document', 'question-archive.txt', 'ignored', 'text/plain', 1024, 'other');
reset role;

insert into storage.objects (bucket_id, name, metadata)
select storage_bucket, storage_path, jsonb_build_object('size', file_size, 'mimetype', mime_type)
from public.documents where household_id = 'b2000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';
update public.documents set upload_status = 'uploaded' where household_id = 'b2000000-0000-0000-0000-000000000001';
reset role;

do $$
declare
  target_document record;
  page_id uuid;
  source_text text;
begin
  for target_document in select id, title from public.documents where household_id = 'b2000000-0000-0000-0000-000000000001' loop
    perform private.transition_document_processing_status(target_document.id, 'queued');
    perform private.transition_document_processing_status(target_document.id, 'processing');
    source_text := 'Synthetic source for ' || target_document.title || '.';
    insert into public.document_pages (document_id, page_number, extracted_text, character_count)
    values (target_document.id, 1, source_text, char_length(source_text)) returning id into page_id;
    insert into public.document_chunks (document_id, page_id, page_number, chunk_index, content, character_count, token_estimate)
    values (target_document.id, page_id, 1, 0, source_text, char_length(source_text), 8);
    perform private.transition_document_processing_status(target_document.id, 'completed');
  end loop;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';
select throws_ok(
  $$insert into public.document_questions (document_id, household_id, language, question, question_normalized, requested_by)
      values ((select id from public.documents where title = 'Question target document'), 'b2000000-0000-0000-0000-000000000001', 'en', 'forged', 'forged', 'b1000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'browser roles cannot insert question rows directly'
);
select throws_ok(
  $$select * from public.document_questions$$,
  '42501', null, 'browser roles cannot read question rows directly'
);
select lives_ok(
  $$select * from public.request_document_question((select id from public.documents where title = 'Question target document'), 'en', 'What is the next step?')$$,
  'an owner can request an eligible question'
);
reset role;
select is((select status from public.document_questions where question = 'What is the next step?'), 'queued', 'a new question is queued');
select is((select household_id from public.document_questions where question = 'What is the next step?'), 'b2000000-0000-0000-0000-000000000001'::uuid, 'household is derived from document');
select is((select requested_by from public.document_questions where question = 'What is the next step?'), 'b1000000-0000-0000-0000-000000000001'::uuid, 'requester is derived from authentication');
set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';
select ok((select already_active from public.request_document_question((select id from public.documents where title = 'Question target document'), 'en', 'What is the next step?')), 'active duplicate reports existing job');
reset role;
select is((select count(*) from public.document_questions where question = 'What is the next step?'), 1::bigint, 'duplicate requests do not create another row');

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000003';
select throws_ok(
  $$select * from public.request_document_question((select id from public.documents where title = 'Question target document'), 'en', 'Viewer question')$$,
  '42501', null, 'a viewer cannot create provider work'
);
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000004';
select throws_ok(
  $$select * from public.request_document_question((select id from public.documents where title = 'Question target document'), 'en', 'Outsider question')$$,
  '42501', null, 'an unrelated household cannot request a question'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select * from public.claim_next_document_question_job('forged-browser-worker')$$,
  '42501', null, 'an authenticated browser role cannot claim a question'
);
reset role;

set local request.jwt.claim.role = 'service_role';
select lives_ok($$select * from public.claim_next_document_question_job('synthetic-question-worker-one')$$, 'service worker claims question atomically');
reset role;
select is((select status from public.document_questions where question = 'What is the next step?'), 'answering', 'claiming marks question as answering');
set local request.jwt.claim.role = 'service_role';
select is((select count(*) from public.claim_next_document_question_job('synthetic-question-worker-two')), 0::bigint, 'claimed question cannot be claimed twice');
select throws_ok(
  $$select public.complete_document_question_job(
      (select id from public.document_questions where question = 'What is the next step?'),
      'synthetic-question-worker-one', 'Synthetic grounded answer.',
      jsonb_build_array(jsonb_build_object(
        'reference_id', 'source-1',
        'page_id', (select page.id from public.document_pages as page join public.documents as document on document.id = page.document_id where document.title = 'Other question source'),
        'page_number', 1,
        'chunk_id', (select chunk.id from public.document_chunks as chunk join public.documents as document on document.id = chunk.document_id where document.title = 'Other question source'),
        'chunk_index', 0,
        'excerpt', 'Synthetic source for Other question source.'
      )), 'full', 1, 45, 'synthetic-provider', 'synthetic-model', 1
    )$$,
  '22023', null, 'completion rejects a citation from another document'
);
select ok(public.complete_document_question_job(
  (select id from public.document_questions where question = 'What is the next step?'),
  'synthetic-question-worker-one', 'Synthetic grounded answer.',
  jsonb_build_array(jsonb_build_object(
    'reference_id', 'source-1',
    'page_id', (select page.id from public.document_pages as page join public.documents as document on document.id = page.document_id where document.title = 'Question target document'),
    'page_number', 1,
    'chunk_id', (select chunk.id from public.document_chunks as chunk join public.documents as document on document.id = chunk.document_id where document.title = 'Question target document'),
    'chunk_index', 0,
    'excerpt', 'Synthetic source for Question target document.'
  )), 'full', 1, 46, 'synthetic-provider', 'synthetic-model', 1
), 'service worker completes only a same-document cited answer');
reset role;
select is((select status from public.document_questions where question = 'What is the next step?'), 'completed', 'completion stores a completed state');
select set_config(
  'app.document_question_test_id',
  (select id::text from public.document_questions where question = 'What is the next step?'),
  true
);

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000003';
select is((select count(*) from public.get_document_questions((select id from public.documents where title = 'Question target document'))), 1::bigint, 'an active viewer can read an accessible answer through the safe function');
select is(
  (select availability from public.get_document_citation_evidence(
    (select id from public.documents where title = 'Question target document'),
    'document_qa_answer',
    current_setting('app.document_question_test_id')::uuid,
    0
  )),
  'available',
  'an active viewer can resolve evidence only through its completed question owner'
);
select is(
  (select source_kind from public.get_document_citation_evidence(
    (select id from public.documents where title = 'Question target document'),
    'document_qa_answer',
    current_setting('app.document_question_test_id')::uuid,
    0
  )),
  'section',
  'a non-PDF source is represented as a logical section'
);
select ok(
  (select char_length(excerpt) <= 600 from public.get_document_citation_evidence(
    (select id from public.documents where title = 'Question target document'),
    'document_qa_answer',
    current_setting('app.document_question_test_id')::uuid,
    0
  )),
  'evidence exposes only a bounded excerpt'
);
select is(
  (select availability from public.get_document_citation_evidence(
    (select id from public.documents where title = 'Question target document'),
    'document_qa_answer',
    current_setting('app.document_question_test_id')::uuid,
    143
  )),
  'unavailable',
  'an out-of-range citation returns the generic unavailable state'
);
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000004';
select is((select count(*) from public.get_document_questions((select id from public.documents where title = 'Question target document'))), 0::bigint, 'other household cannot read an answer');
select is(
  (select availability from public.get_document_citation_evidence(
    (select id from public.documents where title = 'Question target document'),
    'document_qa_answer',
    current_setting('app.document_question_test_id')::uuid,
    0
  )),
  'unavailable',
  'another household receives the same unavailable citation state'
);
reset role;

update public.household_members set status = 'removed'
where household_id = 'b2000000-0000-0000-0000-000000000001' and user_id = 'b1000000-0000-0000-0000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000003';
select is((select count(*) from public.get_document_questions((select id from public.documents where title = 'Question target document'))), 0::bigint, 'a removed member loses answer access immediately');
select is(
  (select availability from public.get_document_citation_evidence(
    (select id from public.documents where title = 'Question target document'),
    'document_qa_answer',
    current_setting('app.document_question_test_id')::uuid,
    0
  )),
  'unavailable',
  'a removed member loses evidence access immediately'
);
reset role;

update public.household_members set permission = 'administrator'
where household_id = 'b2000000-0000-0000-0000-000000000001' and user_id = 'b1000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000002';
select lives_ok(
  $$select * from public.request_document_question((select id from public.documents where title = 'Other question source'), 'es', 'What is the administrator workflow?')$$,
  'an active household administrator can request eligible question work'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000002';
select lives_ok(
  $$select * from public.request_document_question((select id from public.documents where title = 'Archive question document'), 'en', 'What is archived?')$$,
  'an active member can request a different eligible question'
);
reset role;
update public.documents set upload_status = 'archived' where title = 'Archive question document';
select is((select status from public.document_questions where question = 'What is archived?'), 'failed', 'archive cancels queued question work');

update public.documents set upload_status = 'archived' where title = 'Question target document';
select is(
  (select availability from public.get_document_citation_evidence(
    (select id from public.documents where title = 'Question target document'),
    'document_qa_answer',
    current_setting('app.document_question_test_id')::uuid,
    0
  )),
  'unavailable',
  'an archived source document returns the generic unavailable state'
);

set local role anon;
select throws_ok(
  $$select * from public.request_document_question((select id from public.documents where title = 'Question target document'), 'en', 'Anonymous question')$$,
  '42501', null, 'anonymous users cannot request a question'
);
reset role;

select * from finish();
rollback;
