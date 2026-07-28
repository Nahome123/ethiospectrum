-- ETH-018: deterministic quality evaluation and household summary review.
--
-- This migration deliberately does not change the document-summary generation
-- lifecycle. Quality evaluation is local and deterministic; no provider,
-- worker, secret, or browser-supplied household/reviewer identity is involved.

create or replace function private.document_summary_review_categories_are_unique(categories text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(categories) = cardinality(array(select distinct unnest(categories)));
$$;

create table public.document_summary_evaluations (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null unique references public.document_summaries(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  evaluation_version text not null default 'document-summary-quality-v1'
    check (evaluation_version = btrim(evaluation_version) and char_length(evaluation_version) between 1 and 80),
  overall_score integer check (overall_score between 0 and 100),
  grounding_score integer check (grounding_score between 0 and 100),
  citation_coverage_score integer check (citation_coverage_score between 0 and 100),
  completeness_score integer check (completeness_score between 0 and 100),
  language_score integer check (language_score between 0 and 100),
  safety_score integer check (safety_score between 0 and 100),
  checks jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_summary_evaluations_payload_shape check (
    jsonb_typeof(checks) = 'object'
    and jsonb_typeof(warnings) = 'array'
    and jsonb_array_length(warnings) <= 32
    and octet_length(checks::text) <= 12000
    and octet_length(warnings::text) <= 4000
    and (error_code is null or error_code in ('summary_unavailable', 'evaluation_invalid'))
  ),
  constraint document_summary_evaluations_status_shape check (
    (status = 'pending'
      and overall_score is null
      and grounding_score is null
      and citation_coverage_score is null
      and completeness_score is null
      and language_score is null
      and safety_score is null
      and evaluated_at is null
      and error_code is null)
    or (status = 'completed'
      and overall_score is not null
      and grounding_score is not null
      and citation_coverage_score is not null
      and completeness_score is not null
      and language_score is not null
      and safety_score is not null
      and evaluated_at is not null
      and error_code is null)
    or (status = 'failed'
      and overall_score is null
      and grounding_score is null
      and citation_coverage_score is null
      and completeness_score is null
      and language_score is null
      and safety_score is null
      and evaluated_at is not null
      and error_code is not null)
  )
);

create index document_summary_evaluations_household_evaluated_idx
  on public.document_summary_evaluations (household_id, evaluated_at desc);
create index document_summary_evaluations_document_idx
  on public.document_summary_evaluations (document_id);

create table public.document_summary_reviews (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null references public.document_summaries(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  reviewed_by uuid not null references auth.users(id) on delete cascade,
  review_status text not null default 'review_in_progress'
    check (review_status in ('review_in_progress', 'approved', 'rejected', 'needs_revision')),
  overall_rating integer check (overall_rating between 1 and 5),
  accuracy_rating integer check (accuracy_rating between 1 and 5),
  completeness_rating integer check (completeness_rating between 1 and 5),
  citation_rating integer check (citation_rating between 1 and 5),
  language_rating integer check (language_rating between 1 and 5),
  issue_categories text[] not null default '{}'::text[]
    check (cardinality(issue_categories) <= 12),
  feedback text,
  decision text check (decision in ('approved', 'rejected', 'needs_revision')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint document_summary_reviews_unique_reviewer unique (summary_id, reviewed_by),
  constraint document_summary_reviews_categories check (
    issue_categories <@ array[
      'incorrect_fact',
      'missing_information',
      'unsupported_claim',
      'incorrect_date',
      'incorrect_person_or_organization',
      'citation_missing',
      'citation_incorrect',
      'language_quality',
      'translation_problem',
      'unsafe_or_misleading',
      'other'
    ]::text[]
    and private.document_summary_review_categories_are_unique(issue_categories)
  ),
  constraint document_summary_reviews_feedback check (
    feedback is null or (feedback = btrim(feedback) and char_length(feedback) between 1 and 2000)
  ),
  constraint document_summary_reviews_decision_shape check (
    (decision is null and review_status = 'review_in_progress' and submitted_at is null)
    or (decision is not null and review_status = decision and submitted_at is not null)
  ),
  constraint document_summary_reviews_content check (
    overall_rating is not null
    or accuracy_rating is not null
    or completeness_rating is not null
    or citation_rating is not null
    or language_rating is not null
    or cardinality(issue_categories) > 0
    or feedback is not null
  )
);

create index document_summary_reviews_summary_submitted_idx
  on public.document_summary_reviews (summary_id, submitted_at desc nulls last, updated_at desc);
create index document_summary_reviews_household_updated_idx
  on public.document_summary_reviews (household_id, updated_at desc);

drop trigger if exists document_summary_evaluations_set_updated_at on public.document_summary_evaluations;
create trigger document_summary_evaluations_set_updated_at
  before update on public.document_summary_evaluations
  for each row execute function private.set_updated_at();

drop trigger if exists document_summary_reviews_set_updated_at on public.document_summary_reviews;
create trigger document_summary_reviews_set_updated_at
  before update on public.document_summary_reviews
  for each row execute function private.set_updated_at();

create or replace function private.document_summary_quality_matches_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_summary public.document_summaries%rowtype;
begin
  select * into target_summary
  from public.document_summaries as summary
  where summary.id = new.summary_id;

  if not found
    or target_summary.document_id <> new.document_id
    or target_summary.household_id <> new.household_id then
    raise exception 'Summary quality record does not match its summary.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.document_summary_review_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.summary_id <> old.summary_id
    or new.document_id <> old.document_id
    or new.household_id <> old.household_id
    or new.reviewed_by <> old.reviewed_by
    or old.submitted_at is not null then
    raise exception 'Submitted summary reviews cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists document_summary_evaluations_match_summary on public.document_summary_evaluations;
create trigger document_summary_evaluations_match_summary
  before insert or update of summary_id, document_id, household_id on public.document_summary_evaluations
  for each row execute function private.document_summary_quality_matches_summary();

drop trigger if exists document_summary_reviews_match_summary on public.document_summary_reviews;
create trigger document_summary_reviews_match_summary
  before insert or update of summary_id, document_id, household_id on public.document_summary_reviews
  for each row execute function private.document_summary_quality_matches_summary();

drop trigger if exists document_summary_reviews_immutable on public.document_summary_reviews;
create trigger document_summary_reviews_immutable
  before update on public.document_summary_reviews
  for each row execute function private.document_summary_review_is_immutable();

-- A deterministic, local-only review of persisted summary structure. It
-- repeats the important source ownership checks at review time, but cannot
-- reconstruct historical opaque source-key selection once generation has
-- completed; that selection is already enforced at the ETH-015 write boundary.
create or replace function public.evaluate_document_summary(
  target_document_id uuid,
  requested_language text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  target_summary public.document_summaries%rowtype;
  reference_row jsonb;
  section_name text;
  item_count integer;
  item_index integer;
  valid_reference_json boolean := true;
  valid_source_ownership boolean := true;
  citation_total integer := 0;
  cited_statement_total integer := 0;
  missing_sections jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  structured_valid boolean := false;
  output_safe boolean := true;
  output_length_valid boolean := true;
  grounding_score_value integer;
  citation_score_value integer;
  completeness_score_value integer;
  language_score_value integer;
  safety_score_value integer;
  overall_score_value integer;
  checks_value jsonb;
begin
  if auth.uid() is null or requested_language not in ('en', 'am', 'es') then
    raise exception 'Summary quality evaluation is unavailable.' using errcode = '42501';
  end if;

  select * into target_document
  from public.documents as document
  where document.id = target_document_id
  for update;

  if not found
    or target_document.upload_status <> 'uploaded'
    or target_document.processing_status <> 'completed'
    or target_document.deleted_at is not null
    or not private.has_household_permission(
      target_document.household_id,
      array['owner', 'administrator', 'member']::public.household_permission[]
    ) then
    raise exception 'Summary quality evaluation is unavailable.' using errcode = '42501';
  end if;

  select * into target_summary
  from public.document_summaries as summary
  where summary.document_id = target_document.id
    and summary.language = requested_language
  for update;

  if not found or target_summary.status <> 'completed' then
    raise exception 'Summary quality evaluation is unavailable.' using errcode = '42501';
  end if;

  structured_valid := private.document_summary_output_is_valid(target_summary.structured_summary);
  output_length_valid := char_length(coalesce(target_summary.summary_text, '')) between 1 and 12000;
  output_safe := coalesce(target_summary.structured_summary::text, '') !~* '<\\s*(script|style|iframe|object|embed)'
    and coalesce(target_summary.structured_summary::text, '') !~* 'javascript:'
    and coalesce(target_summary.source_references::text, '') !~* '<\\s*(script|style|iframe|object|embed)'
    and coalesce(target_summary.source_references::text, '') !~* 'javascript:';

  if jsonb_typeof(target_summary.source_references) <> 'array' then
    valid_reference_json := false;
    valid_source_ownership := false;
  else
    for reference_row in select value from jsonb_array_elements(target_summary.source_references)
    loop
      if jsonb_typeof(reference_row) <> 'object'
        or coalesce(reference_row ->> 'reference_id', '') !~ '^source-[1-9][0-9]*$'
        or coalesce(reference_row ->> 'section', '') not in (
          'overview', 'keyPoints', 'importantDates', 'actionItems', 'organizationsOrPeople', 'warningsOrUncertainties'
        )
        or coalesce(reference_row ->> 'item_index', '') !~ '^[0-9]+$'
        or coalesce(reference_row ->> 'page_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        or coalesce(reference_row ->> 'page_number', '') !~ '^[1-9][0-9]*$'
        or coalesce(reference_row ->> 'excerpt', '') = ''
        or char_length(coalesce(reference_row ->> 'excerpt', '')) > 320
        or ((reference_row ->> 'chunk_id') is null) <> ((reference_row ->> 'chunk_index') is null)
        or ((reference_row ->> 'chunk_id') is not null and (
          reference_row ->> 'chunk_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          or reference_row ->> 'chunk_index' !~ '^[0-9]+$'
        )) then
        valid_reference_json := false;
        valid_source_ownership := false;
      elsif not exists (
        select 1
        from public.document_pages as page
        where page.id = (reference_row ->> 'page_id')::uuid
          and page.document_id = target_document.id
          and page.page_number = (reference_row ->> 'page_number')::integer
          and (
            ((reference_row ->> 'chunk_id') is null and position(reference_row ->> 'excerpt' in page.extracted_text) > 0)
            or ((reference_row ->> 'chunk_id') is not null and exists (
              select 1 from public.document_chunks as chunk
              where chunk.id = (reference_row ->> 'chunk_id')::uuid
                and chunk.document_id = target_document.id
                and chunk.page_id = page.id
                and chunk.page_number = page.page_number
                and chunk.chunk_index = (reference_row ->> 'chunk_index')::integer
                and position(reference_row ->> 'excerpt' in chunk.content) > 0
            ))
          )
      ) then
        valid_source_ownership := false;
      end if;
    end loop;
  end if;

  if structured_valid then
    foreach section_name in array array[
      'overview', 'keyPoints', 'importantDates', 'actionItems', 'organizationsOrPeople', 'warningsOrUncertainties'
    ]
    loop
      if section_name = 'overview' then
        if coalesce(target_summary.structured_summary -> 'overview' ->> 'text', '') <> '' then
          citation_total := citation_total + 1;
          if exists (
            select 1 from jsonb_array_elements(target_summary.source_references) as reference(value)
            where reference.value ->> 'section' = 'overview'
              and reference.value ->> 'item_index' = '0'
          ) then
            cited_statement_total := cited_statement_total + 1;
          else
            missing_sections := missing_sections || jsonb_build_array('overview');
          end if;
        end if;
      else
        item_count := jsonb_array_length(target_summary.structured_summary -> section_name);
        for item_index in 0..greatest(item_count - 1, -1)
        loop
          exit when item_index < 0;
          citation_total := citation_total + 1;
          if exists (
            select 1 from jsonb_array_elements(target_summary.source_references) as reference(value)
            where reference.value ->> 'section' = section_name
              and reference.value ->> 'item_index' = item_index::text
          ) then
            cited_statement_total := cited_statement_total + 1;
          else
            missing_sections := missing_sections || jsonb_build_array(section_name || ':' || item_index::text);
          end if;
        end loop;
      end if;
    end loop;
  end if;

  if target_summary.source_coverage = 'partial' then
    warnings := warnings || jsonb_build_array('partial_document');
  end if;
  if not structured_valid then warnings := warnings || jsonb_build_array('invalid_structured_summary'); end if;
  if not valid_reference_json then warnings := warnings || jsonb_build_array('invalid_source_reference_format'); end if;
  if not valid_source_ownership then warnings := warnings || jsonb_build_array('invalid_or_cross_document_reference'); end if;
  if citation_total = 0 then warnings := warnings || jsonb_build_array('summary_has_no_citable_content'); end if;
  if jsonb_array_length(missing_sections) > 0 then warnings := warnings || jsonb_build_array('missing_citations'); end if;
  if char_length(coalesce(target_summary.summary_text, '')) < 40 then warnings := warnings || jsonb_build_array('suspiciously_short_summary'); end if;
  if not output_length_valid then warnings := warnings || jsonb_build_array('output_length_invalid'); end if;
  if not output_safe then warnings := warnings || jsonb_build_array('unsafe_markup_detected'); end if;

  grounding_score_value := case when structured_valid and valid_reference_json and valid_source_ownership then 100 else 0 end;
  citation_score_value := case when citation_total = 0 then 0 else floor((cited_statement_total::numeric / citation_total::numeric) * 100)::integer end;
  completeness_score_value := case
    when not structured_valid then 0
    when char_length(coalesce(target_summary.summary_text, '')) < 40 then 50
    when jsonb_array_length(missing_sections) > 0 then 70
    else 100
  end;
  language_score_value := case when target_summary.language in ('en', 'am', 'es') then 100 else 0 end;
  safety_score_value := case when output_safe and output_length_valid then 100 else 0 end;
  overall_score_value := floor((grounding_score_value + citation_score_value + completeness_score_value + language_score_value + safety_score_value)::numeric / 5)::integer;
  checks_value := jsonb_build_object(
    'summaryEligible', true,
    'summaryStatusCompleted', true,
    'structuredSummaryValid', structured_valid,
    'sourceReferencesValidJson', valid_reference_json,
    'sameDocumentReferencesValid', valid_source_ownership,
    'citationStatements', citation_total,
    'citedStatements', cited_statement_total,
    'missingCitationTargets', missing_sections,
    'partialDocument', target_summary.source_coverage = 'partial',
    'fullDocumentAnalysed', target_summary.source_coverage = 'full',
    'outputLengthValid', output_length_valid,
    'unsafeMarkupDetected', not output_safe,
    'language', target_summary.language,
    'verificationNoticeRequired', true,
    'sourceMaterialRechecked', valid_source_ownership
  );

  insert into public.document_summary_evaluations (
    summary_id, document_id, household_id, status, overall_score, grounding_score,
    citation_coverage_score, completeness_score, language_score, safety_score,
    checks, warnings, evaluated_at, error_code
  ) values (
    target_summary.id, target_document.id, target_document.household_id, 'completed', overall_score_value,
    grounding_score_value, citation_score_value, completeness_score_value, language_score_value,
    safety_score_value, checks_value, warnings, now(), null
  )
  on conflict (summary_id) do update set
    status = excluded.status,
    evaluation_version = excluded.evaluation_version,
    overall_score = excluded.overall_score,
    grounding_score = excluded.grounding_score,
    citation_coverage_score = excluded.citation_coverage_score,
    completeness_score = excluded.completeness_score,
    language_score = excluded.language_score,
    safety_score = excluded.safety_score,
    checks = excluded.checks,
    warnings = excluded.warnings,
    evaluated_at = excluded.evaluated_at,
    error_code = null;
  return true;
end;
$$;

create or replace function public.upsert_document_summary_review(
  target_document_id uuid,
  requested_language text,
  requested_overall_rating integer,
  requested_accuracy_rating integer,
  requested_completeness_rating integer,
  requested_citation_rating integer,
  requested_language_rating integer,
  requested_issue_categories text[],
  requested_feedback text,
  requested_decision text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  target_summary public.document_summaries%rowtype;
  existing_review public.document_summary_reviews%rowtype;
  normalized_categories text[] := coalesce(requested_issue_categories, '{}'::text[]);
  normalized_feedback text := nullif(btrim(coalesce(requested_feedback, '')), '');
  normalized_decision text := nullif(btrim(coalesce(requested_decision, '')), '');
  overall_rating_value integer := nullif(requested_overall_rating, 0);
  accuracy_rating_value integer := nullif(requested_accuracy_rating, 0);
  completeness_rating_value integer := nullif(requested_completeness_rating, 0);
  citation_rating_value integer := nullif(requested_citation_rating, 0);
  language_rating_value integer := nullif(requested_language_rating, 0);
  can_decide boolean := false;
begin
  if auth.uid() is null or requested_language not in ('en', 'am', 'es') then
    raise exception 'Summary review is unavailable.' using errcode = '42501';
  end if;
  if overall_rating_value is not null and overall_rating_value not between 1 and 5
    or accuracy_rating_value is not null and accuracy_rating_value not between 1 and 5
    or completeness_rating_value is not null and completeness_rating_value not between 1 and 5
    or citation_rating_value is not null and citation_rating_value not between 1 and 5
    or language_rating_value is not null and language_rating_value not between 1 and 5
    or cardinality(normalized_categories) > 12
    or not (normalized_categories <@ array[
      'incorrect_fact', 'missing_information', 'unsupported_claim', 'incorrect_date',
      'incorrect_person_or_organization', 'citation_missing', 'citation_incorrect',
      'language_quality', 'translation_problem', 'unsafe_or_misleading', 'other'
    ]::text[])
    or cardinality(normalized_categories) <> cardinality(array(select distinct unnest(normalized_categories)))
    or (normalized_feedback is not null and char_length(normalized_feedback) > 2000)
    or normalized_decision not in ('approved', 'rejected', 'needs_revision') and normalized_decision is not null then
    raise exception 'Summary review input is invalid.' using errcode = '22023';
  end if;

  select * into target_document from public.documents as document where document.id = target_document_id for update;
  if not found
    or target_document.upload_status <> 'uploaded'
    or target_document.processing_status <> 'completed'
    or target_document.deleted_at is not null
    or not private.has_household_permission(
      target_document.household_id,
      array['owner', 'administrator', 'member']::public.household_permission[]
    ) then
    raise exception 'Summary review is unavailable.' using errcode = '42501';
  end if;

  select * into target_summary from public.document_summaries as summary
  where summary.document_id = target_document.id and summary.language = requested_language for update;
  if not found or target_summary.status <> 'completed' then
    raise exception 'Summary review is unavailable.' using errcode = '42501';
  end if;

  can_decide := private.has_household_permission(
    target_document.household_id,
    array['owner', 'administrator']::public.household_permission[]
  );
  if normalized_decision is not null and not can_decide then
    raise exception 'Summary decision is unavailable.' using errcode = '42501';
  end if;
  if normalized_decision is not null and (
    overall_rating_value is null or accuracy_rating_value is null
    or completeness_rating_value is null or citation_rating_value is null
    or language_rating_value is null
  ) then
    raise exception 'Summary decision requires ratings.' using errcode = '22023';
  end if;
  if normalized_decision = 'approved' and not exists (
    select 1 from public.document_summary_evaluations as evaluation
    where evaluation.summary_id = target_summary.id
      and evaluation.status = 'completed'
  ) then
    raise exception 'Summary decision is unavailable.' using errcode = '42501';
  end if;
  if overall_rating_value is null and accuracy_rating_value is null
    and completeness_rating_value is null and citation_rating_value is null
    and language_rating_value is null and cardinality(normalized_categories) = 0
    and normalized_feedback is null then
    raise exception 'Summary review input is invalid.' using errcode = '22023';
  end if;

  select * into existing_review from public.document_summary_reviews as review
  where review.summary_id = target_summary.id and review.reviewed_by = auth.uid() for update;
  if found and existing_review.submitted_at is not null then
    raise exception 'Submitted summary reviews cannot be changed.' using errcode = '42501';
  end if;

  if found then
    update public.document_summary_reviews
    set overall_rating = overall_rating_value,
        accuracy_rating = accuracy_rating_value,
        completeness_rating = completeness_rating_value,
        citation_rating = citation_rating_value,
        language_rating = language_rating_value,
        issue_categories = normalized_categories,
        feedback = normalized_feedback,
        decision = normalized_decision,
        review_status = coalesce(normalized_decision, 'review_in_progress'),
        submitted_at = case when normalized_decision is null then null else now() end
    where id = existing_review.id;
  else
    insert into public.document_summary_reviews (
      summary_id, document_id, household_id, reviewed_by, review_status,
      overall_rating, accuracy_rating, completeness_rating, citation_rating, language_rating,
      issue_categories, feedback, decision, submitted_at
    ) values (
      target_summary.id, target_document.id, target_document.household_id, auth.uid(),
      coalesce(normalized_decision, 'review_in_progress'), overall_rating_value,
      accuracy_rating_value, completeness_rating_value, citation_rating_value,
      language_rating_value, normalized_categories, normalized_feedback, normalized_decision,
      case when normalized_decision is null then null else now() end
    );
  end if;
  return true;
end;
$$;

alter table public.document_summary_evaluations enable row level security;
alter table public.document_summary_evaluations force row level security;
alter table public.document_summary_reviews enable row level security;
alter table public.document_summary_reviews force row level security;

create policy document_summary_evaluations_select_active_document_members
  on public.document_summary_evaluations for select to authenticated
  using (private.can_read_document_summary(document_id));
create policy document_summary_reviews_select_active_document_members
  on public.document_summary_reviews for select to authenticated
  using (private.can_read_document_summary(document_id));

revoke all on table public.document_summary_evaluations, public.document_summary_reviews from public, anon, authenticated;
grant select on table public.document_summary_evaluations, public.document_summary_reviews to authenticated;

revoke all on function private.document_summary_review_categories_are_unique(text[]) from public, anon, authenticated;
revoke all on function private.document_summary_quality_matches_summary() from public, anon, authenticated;
revoke all on function private.document_summary_review_is_immutable() from public, anon, authenticated;
revoke all on function public.evaluate_document_summary(uuid, text) from public, anon;
revoke all on function public.upsert_document_summary_review(uuid, text, integer, integer, integer, integer, integer, text[], text, text) from public, anon;
grant execute on function public.evaluate_document_summary(uuid, text) to authenticated;
grant execute on function public.upsert_document_summary_review(uuid, text, integer, integer, integer, integer, integer, text[], text, text) to authenticated;
