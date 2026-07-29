begin;

select plan(45);

-- Synthetic identities and document text only. No production content or model
-- credentials are present in this transactional pgTAP fixture.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'chat-owner@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'chat-admin@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'chat-member@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'chat-viewer@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'chat-outsider@example.test', 'not-a-real-password', now(), '{}', '{}', now(), now());

insert into public.households (id, name, primary_owner_id, created_by)
values
  ('c2000000-0000-0000-0000-000000000001', 'Chat test household', 'c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000002', 'Other chat household', 'c1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000005');

insert into public.household_members (household_id, user_id, permission, status, joined_at)
values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'owner', 'active', now()),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'administrator', 'active', now()),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'member', 'active', now()),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'viewer', 'active', now()),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000005', 'owner', 'active', now());

select has_table('public', 'document_chat_conversations', 'chat conversation table exists');
select has_table('public', 'document_chat_messages', 'chat message table exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.document_chat_conversations'::regclass), 'conversation RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.document_chat_messages'::regclass), 'message RLS is enabled and forced');
select has_function('public', 'create_document_chat_conversation', array['uuid', 'text', 'text', 'uuid'], 'controlled conversation creation function exists');
select has_function('public', 'send_document_chat_message', array['uuid', 'uuid', 'text', 'uuid'], 'controlled chat send function exists');
select has_function('public', 'retry_document_chat_response', array['uuid', 'uuid', 'uuid'], 'controlled chat retry function exists');
select has_function('public', 'get_document_chat_conversations', array['uuid'], 'safe conversation list function exists');
select has_function('public', 'get_document_chat_conversation', array['uuid', 'uuid'], 'safe conversation read function exists');
select has_function('public', 'claim_next_document_chat_message', array['text'], 'worker claim function exists');
select has_function('public', 'complete_document_chat_message', array['uuid', 'text', 'text', 'text', 'jsonb', 'text', 'integer', 'integer', 'text', 'text', 'integer'], 'worker completion function exists');
select has_function('public', 'fail_document_chat_message', array['uuid', 'text', 'text'], 'worker failure function exists');
select ok(exists (
  select 1 from pg_proc as procedure join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'create_document_chat_conversation'
    and exists (select 1 from unnest(procedure.proconfig) as config where config like 'search_path=%')
), 'conversation creation has a fixed search path');

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
insert into public.documents (household_id, uploaded_by, title, original_filename, storage_path, mime_type, file_size, document_type)
values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Chat target document', 'chat-target.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Other chat source', 'chat-other.txt', 'ignored', 'text/plain', 1024, 'other'),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Archive chat document', 'chat-archive.txt', 'ignored', 'text/plain', 1024, 'other');
reset role;

insert into storage.objects (bucket_id, name, metadata)
select storage_bucket, storage_path, jsonb_build_object('size', file_size, 'mimetype', mime_type)
from public.documents where household_id = 'c2000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
update public.documents set upload_status = 'uploaded' where household_id = 'c2000000-0000-0000-0000-000000000001';
reset role;

do $$
declare target_document record; page_id uuid; source_text text;
begin
  for target_document in select id, title from public.documents where household_id = 'c2000000-0000-0000-0000-000000000001' loop
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
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
select throws_ok(
  $$insert into public.document_chat_conversations (document_id, household_id, created_by, language, title, creation_idempotency_key)
    values ((select id from public.documents where title = 'Chat target document'), 'c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'en', 'Forged', 'c3000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'browser roles cannot insert conversations directly'
);
select throws_ok(
  $$insert into public.document_chat_messages (conversation_id, document_id, household_id, role, status, sequence_number)
    values ('c3000000-0000-4000-8000-000000000001', (select id from public.documents where title = 'Chat target document'), 'c2000000-0000-0000-0000-000000000001', 'assistant', 'pending', 1)$$,
  '42501', null, 'browser roles cannot insert assistant messages directly'
);
select lives_ok(
  $$select * from public.create_document_chat_conversation(
    (select id from public.documents where title = 'Chat target document'), 'en', 'What is the next step?', 'c3000000-0000-4000-8000-000000000002')$$,
  'an owner can create a conversation and initial message'
);
reset role;
select is((select language from public.document_chat_conversations limit 1), 'en', 'conversation stores the selected language');
select is((select created_by from public.document_chat_conversations limit 1), 'c1000000-0000-0000-0000-000000000001'::uuid, 'conversation creator is derived from authentication');
select is((select count(*) from public.document_chat_messages where role = 'assistant' and status = 'pending'), 1::bigint, 'initial assistant placeholder is queued');

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.create_document_chat_conversation((select id from public.documents where title = 'Chat target document'), 'en', 'What is the next step?', 'c3000000-0000-4000-8000-000000000002')),
  1::bigint, 'duplicate conversation request safely reuses its result'
);
reset role;
select is((select count(*) from public.document_chat_conversations), 1::bigint, 'duplicate creation does not create a second conversation');

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000004';
select throws_ok(
  $$select * from public.create_document_chat_conversation((select id from public.documents where title = 'Chat target document'), 'en', 'Viewer starts chat', 'c3000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'viewer cannot create a conversation'
);
select is((select count(*) from public.get_document_chat_conversations((select id from public.documents where title = 'Chat target document'))), 1::bigint, 'viewer can read accessible conversations');
reset role;

set local request.jwt.claim.role = 'service_role';
select lives_ok($$select * from public.claim_next_document_chat_message('synthetic-chat-worker-one')$$, 'service worker claims initial response atomically');
select throws_ok(
  $$select public.complete_document_chat_message(
    (select id from public.document_chat_messages where role = 'assistant' limit 1), 'synthetic-chat-worker-one', 'Synthetic answer.', 'grounded_answer',
    jsonb_build_array(jsonb_build_object('reference_id', 'source-1', 'page_id', (select page.id from public.document_pages as page join public.documents as document on document.id = page.document_id where document.title = 'Other chat source'), 'page_number', 1, 'chunk_id', (select chunk.id from public.document_chunks as chunk join public.documents as document on document.id = chunk.document_id where document.title = 'Other chat source'), 'chunk_index', 0)),
    'full', 1, 42, 'synthetic-provider', 'synthetic-model', 1
  )$$,
  '22023', null, 'cross-document citations are rejected'
);
select ok(public.complete_document_chat_message(
  (select id from public.document_chat_messages where role = 'assistant' limit 1), 'synthetic-chat-worker-one', 'Synthetic answer.', 'grounded_answer',
  jsonb_build_array(jsonb_build_object('reference_id', 'source-1', 'page_id', (select page.id from public.document_pages as page join public.documents as document on document.id = page.document_id where document.title = 'Chat target document'), 'page_number', 1, 'chunk_id', (select chunk.id from public.document_chunks as chunk join public.documents as document on document.id = chunk.document_id where document.title = 'Chat target document'), 'chunk_index', 0)),
  'full', 1, 43, 'synthetic-provider', 'synthetic-model', 1
), 'service worker completes a same-document cited response');
reset role;
select is((select status from public.document_chat_messages where role = 'assistant' limit 1), 'completed', 'valid response is completed');

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000003';
select lives_ok(
  $$select * from public.send_document_chat_message((select id from public.documents where title = 'Chat target document'), (select conversation_id from public.get_document_chat_conversations((select id from public.documents where title = 'Chat target document'))), 'Follow-up question', 'c3000000-0000-4000-8000-000000000004')$$,
  'member can send a follow-up message'
);
select is(
  (select count(*) from public.send_document_chat_message((select id from public.documents where title = 'Chat target document'), (select conversation_id from public.get_document_chat_conversations((select id from public.documents where title = 'Chat target document'))), 'Follow-up question', 'c3000000-0000-4000-8000-000000000004')),
  1::bigint, 'duplicate message request safely reuses its assistant placeholder'
);
select throws_ok(
  $$select * from public.send_document_chat_message((select id from public.documents where title = 'Chat target document'), (select conversation_id from public.get_document_chat_conversations((select id from public.documents where title = 'Chat target document'))), 'A second pending question', 'c3000000-0000-4000-8000-000000000005')$$,
  '22023', null, 'only one assistant response can be pending per conversation'
);
reset role;
select is((select count(*) from public.document_chat_messages where role = 'user'), 2::bigint, 'duplicate submission does not add another user message');

set local request.jwt.claim.role = 'service_role';
select lives_ok($$select * from public.claim_next_document_chat_message('synthetic-chat-worker-two')$$, 'worker claims follow-up response');
select ok(public.fail_document_chat_message((select id from public.document_chat_messages where role = 'assistant' and status = 'generating'), 'synthetic-chat-worker-two', 'provider_timeout'), 'worker preserves user message and records a safe failure');
reset role;
select is((select count(*) from public.document_chat_messages where role = 'user'), 2::bigint, 'failure preserves the associated user message');
set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000002';
select lives_ok(
  $$select public.retry_document_chat_response((select id from public.documents where title = 'Chat target document'), (select conversation_id from public.get_document_chat_conversations((select id from public.documents where title = 'Chat target document'))), (select message_id from public.get_document_chat_conversation((select id from public.documents where title = 'Chat target document'), (select conversation_id from public.get_document_chat_conversations((select id from public.documents where title = 'Chat target document')))) where role = 'assistant' and status = 'failed'))$$,
  'administrator can retry the existing failed assistant response'
);
reset role;
select is((select count(*) from public.document_chat_messages where role = 'assistant'), 2::bigint, 'retry does not create another assistant placeholder');

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000005';
select is((select count(*) from public.get_document_chat_conversations((select id from public.documents where title = 'Chat target document'))), 0::bigint, 'unrelated household cannot read conversations');
select throws_ok(
  $$select * from public.send_document_chat_message((select id from public.documents where title = 'Chat target document'), (select conversation_id from public.get_document_chat_conversations((select id from public.documents where title = 'Chat target document'))), 'Forged outsider message', 'c3000000-0000-4000-8000-000000000006')$$,
  '42501', null, 'unrelated household cannot send messages'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.create_document_chat_conversation((select id from public.documents where title = 'Chat target document'), 'en', 'Anonymous message', 'c3000000-0000-4000-8000-000000000007')$$,
  '42501', null, 'anonymous users cannot create conversations'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select * from public.create_document_chat_conversation((select id from public.documents where title = 'Chat target document'), 'fr', 'Invalid locale', 'c3000000-0000-4000-8000-000000000008')$$,
  '22023', null, 'invalid conversation locale is rejected'
);
select throws_ok(
  $$select * from public.create_document_chat_conversation((select id from public.documents where title = 'Chat target document'), 'en', ' ', 'c3000000-0000-4000-8000-000000000009')$$,
  '22023', null, 'empty message is rejected'
);
reset role;

update public.household_members set status = 'removed'
where household_id = 'c2000000-0000-0000-0000-000000000001' and user_id = 'c1000000-0000-0000-0000-000000000004';
set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000004';
select is((select count(*) from public.get_document_chat_conversations((select id from public.documents where title = 'Chat target document'))), 0::bigint, 'removed member loses access immediately');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select * from public.create_document_chat_conversation((select id from public.documents where title = 'Archive chat document'), 'es', 'What is in this document?', 'c3000000-0000-4000-8000-000000000010')$$,
  'owner can create a separate conversation for an archive test'
);
reset role;
update public.documents set upload_status = 'archived' where title = 'Archive chat document';
select is((select status from public.document_chat_conversations where document_id = (select id from public.documents where title = 'Archive chat document')), 'unavailable', 'archive makes its conversation unavailable');
select is((select status from public.document_chat_messages where document_id = (select id from public.documents where title = 'Archive chat document') and role = 'assistant'), 'failed', 'archive cancels a pending assistant response');
select * from finish();
rollback;
