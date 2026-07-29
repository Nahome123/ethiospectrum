-- ETH-020: resolve citations through their persisted owner records without
-- exposing raw derivative rows, storage paths, or signed URLs to browsers.

create or replace function public.get_document_extraction_availability(target_document_id uuid)
returns table (has_sources boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents as document
    where document.id = target_document_id
      and document.upload_status = 'uploaded'
      and document.processing_status = 'completed'
      and document.deleted_at is null
      and private.is_active_household_member(document.household_id)
      and (
        exists (select 1 from public.document_pages as page where page.document_id = document.id)
        or exists (select 1 from public.document_chunks as chunk where chunk.document_id = document.id)
      )
  );
$$;

-- Keep question answers on their existing safe read surface while exposing a
-- stable, non-secret owner ID needed for a citation deep link.
drop function if exists public.get_document_questions(uuid);
create function public.get_document_questions(target_document_id uuid)
returns table (
  question_id uuid,
  question text,
  language text,
  status text,
  retryable boolean,
  completed_at timestamptz,
  source_coverage text,
  answer_text text,
  source_references jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_read_document_question(target_document_id) then
    return;
  end if;
  return query
  select
    document_question.id,
    document_question.question,
    document_question.language,
    document_question.status,
    document_question.status = 'failed'
      and document_question.attempt_count < document_question.max_attempts,
    document_question.completed_at,
    document_question.source_coverage,
    case when document_question.status = 'completed' then document_question.answer_text else null end,
    case when document_question.status = 'completed' then document_question.source_references else '[]'::jsonb end
  from public.document_questions as document_question
  where document_question.document_id = target_document_id
  order by document_question.requested_at desc
  limit 5;
end;
$$;

create or replace function public.get_document_citation_evidence(
  target_document_id uuid,
  target_owner_type text,
  target_owner_id uuid,
  target_citation_index integer
)
returns table (
  availability text,
  document_name text,
  source_kind text,
  page_number integer,
  excerpt text,
  excerpt_shortened boolean,
  can_open_original boolean,
  is_partial_document boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  stored_references jsonb;
  stored_coverage text;
  stored_reference jsonb;
  source_page public.document_pages%rowtype;
  source_chunk public.document_chunks%rowtype;
  source_text text;
  stored_excerpt text;
  bounded_excerpt text;
  source_is_pdf boolean;
  source_is_chunk boolean;
  safe_page_id uuid;
  safe_chunk_id uuid;
  safe_page_number integer;
  safe_chunk_index integer;
  was_shortened boolean := false;
begin
  if auth.uid() is null
    or target_document_id is null
    or target_owner_id is null
    or target_owner_type not in ('document_summary', 'document_qa_answer', 'document_chat_message')
    or target_citation_index is null
    or target_citation_index < 0
    or target_citation_index > 143 then
    return query select 'unavailable'::text, null::text, null::text, null::integer, null::text, false, false, false;
    return;
  end if;

  select * into target_document
  from public.documents as document
  where document.id = target_document_id
    and document.upload_status = 'uploaded'
    and document.processing_status = 'completed'
    and document.deleted_at is null
    and private.is_active_household_member(document.household_id);
  if not found then
    return query select 'unavailable'::text, null::text, null::text, null::integer, null::text, false, false, false;
    return;
  end if;

  if target_owner_type = 'document_summary' then
    select summary.source_references, summary.source_coverage
      into stored_references, stored_coverage
    from public.document_summaries as summary
    where summary.id = target_owner_id
      and summary.document_id = target_document.id
      and summary.household_id = target_document.household_id
      and summary.status = 'completed';
  elsif target_owner_type = 'document_qa_answer' then
    select question.source_references, question.source_coverage
      into stored_references, stored_coverage
    from public.document_questions as question
    where question.id = target_owner_id
      and question.document_id = target_document.id
      and question.household_id = target_document.household_id
      and question.status = 'completed';
  else
    select message.citations, message.source_coverage
      into stored_references, stored_coverage
    from public.document_chat_messages as message
    join public.document_chat_conversations as conversation on conversation.id = message.conversation_id
    where message.id = target_owner_id
      and message.role = 'assistant'
      and message.status = 'completed'
      and message.document_id = target_document.id
      and message.household_id = target_document.household_id
      and conversation.document_id = target_document.id
      and conversation.household_id = target_document.household_id;
  end if;

  if stored_references is null
    or jsonb_typeof(stored_references) <> 'array'
    or target_citation_index >= jsonb_array_length(stored_references) then
    return query select 'unavailable'::text, null::text, null::text, null::integer, null::text, false, false, false;
    return;
  end if;

  stored_reference := stored_references -> target_citation_index;
  if jsonb_typeof(stored_reference) <> 'object'
    or not (stored_reference ?& array['reference_id', 'page_id', 'page_number', 'chunk_id', 'chunk_index'])
    or coalesce(stored_reference ->> 'reference_id', '') !~ '^source-[1-9][0-9]*$'
    or coalesce(stored_reference ->> 'page_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(stored_reference ->> 'page_number', '') !~ '^[1-9][0-9]*$' then
    return query select 'unavailable'::text, null::text, null::text, null::integer, null::text, false, false, false;
    return;
  end if;

  safe_page_id := (stored_reference ->> 'page_id')::uuid;
  safe_page_number := (stored_reference ->> 'page_number')::integer;
  source_is_chunk := stored_reference -> 'chunk_id' <> 'null'::jsonb;
  if source_is_chunk then
    if coalesce(stored_reference ->> 'chunk_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(stored_reference ->> 'chunk_index', '') !~ '^[0-9]+$' then
      return query select 'unavailable'::text, null::text, null::text, null::integer, null::text, false, false, false;
      return;
    end if;
    safe_chunk_id := (stored_reference ->> 'chunk_id')::uuid;
    safe_chunk_index := (stored_reference ->> 'chunk_index')::integer;
  elsif stored_reference -> 'chunk_index' <> 'null'::jsonb then
    return query select 'unavailable'::text, null::text, null::text, null::integer, null::text, false, false, false;
    return;
  end if;

  select * into source_page
  from public.document_pages as page
  where page.id = safe_page_id
    and page.document_id = target_document.id
    and page.page_number = safe_page_number;
  if not found then
    return query select 'unavailable'::text, null::text, null::text, null::integer, null::text, false, false, false;
    return;
  end if;

  if source_is_chunk then
    select * into source_chunk
    from public.document_chunks as chunk
    where chunk.id = safe_chunk_id
      and chunk.document_id = target_document.id
      and chunk.page_id = source_page.id
      and chunk.page_number = source_page.page_number
      and chunk.chunk_index = safe_chunk_index;
    if not found then
      return query select 'unavailable'::text, null::text, null::text, null::integer, null::text, false, false, false;
      return;
    end if;
    source_text := btrim(source_chunk.content);
  else
    source_text := btrim(source_page.extracted_text);
  end if;
  if source_text = '' then
    return query select 'unavailable'::text, null::text, null::text, null::integer, null::text, false, false, false;
    return;
  end if;

  -- Older summary and Q&A records include a shorter stored excerpt. Prefer it
  -- only when it is demonstrably contained in the validated source text.
  stored_excerpt := btrim(coalesce(stored_reference ->> 'excerpt', ''));
  if char_length(stored_excerpt) between 1 and 320 and position(stored_excerpt in source_text) > 0 then
    source_text := stored_excerpt;
  end if;

  bounded_excerpt := source_text;
  if char_length(bounded_excerpt) > 600 then
    bounded_excerpt := btrim(regexp_replace(left(bounded_excerpt, 599), E'\\s+\\S*$', ''));
    if char_length(bounded_excerpt) < 240 then bounded_excerpt := btrim(left(source_text, 599)); end if;
    bounded_excerpt := bounded_excerpt || chr(8230);
    was_shortened := true;
  end if;

  source_is_pdf := target_document.mime_type = 'application/pdf';
  return query
  select
    'available'::text,
    target_document.title,
    case when source_is_pdf then 'page'::text else 'section'::text end,
    source_page.page_number,
    bounded_excerpt,
    was_shortened,
    source_is_pdf,
    stored_coverage = 'partial';
end;
$$;

-- Derivative text is now exposed only through the owner-bound evidence RPC.
-- Existing RLS policies remain enabled and forced as defense in depth.
revoke select on table public.document_pages from authenticated;
revoke select on table public.document_chunks from authenticated;

revoke all on function public.get_document_extraction_availability(uuid) from public, anon;
grant execute on function public.get_document_extraction_availability(uuid) to authenticated;
revoke all on function public.get_document_questions(uuid) from public, anon;
grant execute on function public.get_document_questions(uuid) to authenticated;
revoke all on function public.get_document_citation_evidence(uuid, text, uuid, integer) from public, anon;
grant execute on function public.get_document_citation_evidence(uuid, text, uuid, integer) to authenticated;
