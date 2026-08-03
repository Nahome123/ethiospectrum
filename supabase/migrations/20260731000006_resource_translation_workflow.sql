-- ETH-024: reviewed Amharic and Spanish resource translations. English remains canonical.
alter table public.resource_translations
  add column if not exists submitted_by uuid references public.profiles(id),
  add column if not exists submitted_at timestamptz,
  add column if not exists source_translation_version integer,
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists updated_by uuid references public.profiles(id);

update public.resource_translations as translation
set created_by = coalesce(translation.created_by, resource.author_id, resource.updated_by),
    updated_by = coalesce(translation.updated_by, resource.updated_by, resource.author_id)
from public.resources as resource
where resource.id = translation.resource_id;

alter table public.resource_translations
  add constraint resource_translation_source_version_valid check (
    (locale = 'en' and source_translation_version is null) or
    (locale in ('am', 'es') and source_translation_version > 0)
  );

create index if not exists resource_translations_public_locale_idx
  on public.resource_translations(resource_id, locale, review_status, source_translation_version);

create table public.resource_translation_audit_events (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  translation_id uuid not null references public.resource_translations(id) on delete cascade,
  locale text not null check (locale in ('am', 'es')),
  actor_user_id uuid not null references public.profiles(id),
  action text not null check (action in ('created', 'updated', 'submitted', 'withdrawn', 'approved', 'rejected', 'source_changed')),
  from_review_status text check (from_review_status in ('draft', 'in_review', 'approved')),
  to_review_status text check (to_review_status in ('draft', 'in_review', 'approved')),
  translation_version integer not null check (translation_version > 0),
  source_translation_version integer not null check (source_translation_version > 0),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.resource_translation_audit_events enable row level security;
alter table public.resource_translation_audit_events force row level security;

-- Content editors are global editorial roles; household membership is deliberately irrelevant.
create or replace function private.can_manage_resources()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.current_app_role() in ('administrator'::public.app_role, 'content_editor'::public.app_role), false);
$$;

drop policy if exists resources_published_read on public.resources;
drop policy if exists resource_translations_read on public.resource_translations;
create policy resources_editor_read on public.resources for select using (private.can_manage_resources());
create policy resource_translations_editor_read on public.resource_translations for select using (private.can_manage_resources());
create policy resource_translation_audit_events_editor_read on public.resource_translation_audit_events
  for select using (private.can_manage_resources());
revoke all on public.resource_translation_audit_events from public, anon, authenticated;
grant select on public.resources, public.resource_translations, public.resource_translation_audit_events to authenticated;

create or replace function private.validate_resource_translation_content(input_title text, input_summary text, input_body text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if char_length(btrim(coalesce(input_title, ''))) not between 3 and 160
    or char_length(btrim(coalesce(input_summary, ''))) not between 10 and 500
    or char_length(btrim(coalesce(input_body, ''))) not between 50 and 50000 then
    raise exception 'Translation content is invalid.' using errcode='22023';
  end if;
end;
$$;

create or replace function private.require_translation_context(target_resource_id uuid)
returns integer
language plpgsql security definer set search_path='' as $$
declare current_resource public.resources%rowtype; current_english public.resource_translations%rowtype;
begin
  if not private.can_manage_resources() or auth.uid() is null then raise exception 'Resource access is unavailable.' using errcode='42501'; end if;
  select * into current_resource from public.resources where id=target_resource_id for update;
  if not found or current_resource.status='archived' or current_resource.archived_at is not null then raise exception 'Resource is unavailable.' using errcode='42501'; end if;
  select * into current_english from public.resource_translations where resource_id=target_resource_id and locale='en' for update;
  if not found or current_english.review_status<>'approved' or current_resource.status not in ('in_review','published') then
    raise exception 'Canonical English content is unavailable.' using errcode='22023';
  end if;
  return current_english.version;
end;
$$;

create or replace function public.create_resource_translation_draft(target_resource_id uuid, input_locale text, input_title text, input_summary text, input_body text)
returns table(translation_id uuid, translation_version integer, source_version integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); english_version integer; existing public.resource_translations%rowtype; created public.resource_translations%rowtype;
begin
  if input_locale not in ('am','es') then raise exception 'Translation locale is unavailable.' using errcode='22023'; end if;
  perform private.validate_resource_translation_content(input_title,input_summary,input_body);
  english_version:=private.require_translation_context(target_resource_id);
  select * into existing from public.resource_translations where resource_id=target_resource_id and locale=input_locale for update;
  if found then return query select existing.id,existing.version,coalesce(existing.source_translation_version,english_version); return; end if;
  insert into public.resource_translations(resource_id,locale,title,summary,body,review_status,source_translation_version,created_by,updated_by)
    values(target_resource_id,input_locale,btrim(input_title),btrim(input_summary),btrim(input_body),'draft',english_version,actor,actor)
    returning * into created;
  insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,to_review_status,translation_version,source_translation_version)
    values(target_resource_id,created.id,input_locale,actor,'created','draft',created.version,english_version);
  return query select created.id,created.version,english_version;
end;
$$;

create or replace function public.update_resource_translation_draft(target_translation_id uuid, expected_version integer, input_title text, input_summary text, input_body text)
returns table(translation_id uuid, translation_version integer, source_version integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); translation public.resource_translations%rowtype; english_version integer; new_version integer;
begin
  select * into translation from public.resource_translations where id=target_translation_id for update;
  if not found or translation.locale not in ('am','es') then raise exception 'Translation is unavailable.' using errcode='42501'; end if;
  if translation.version<>expected_version then raise exception 'Translation is stale.' using errcode='40001'; end if;
  if translation.review_status<>'draft' then raise exception 'Translation transition is invalid.' using errcode='22023'; end if;
  perform private.validate_resource_translation_content(input_title,input_summary,input_body);
  english_version:=private.require_translation_context(translation.resource_id);
  update public.resource_translations set title=btrim(input_title),summary=btrim(input_summary),body=btrim(input_body),source_translation_version=english_version,
    submitted_by=null,submitted_at=null,reviewed_by=null,reviewed_at=null,review_note=null,updated_by=actor,version=version+1 where id=translation.id returning version into new_version;
  insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,from_review_status,to_review_status,translation_version,source_translation_version)
    values(translation.resource_id,translation.id,translation.locale,actor,'updated','draft','draft',new_version,english_version);
  return query select translation.id,new_version,english_version;
end;
$$;

create or replace function public.submit_resource_translation(target_translation_id uuid, expected_version integer)
returns table(translation_id uuid, translation_version integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); translation public.resource_translations%rowtype; english_version integer; new_version integer;
begin
  select * into translation from public.resource_translations where id=target_translation_id for update;
  if not found or translation.locale not in ('am','es') then raise exception 'Translation is unavailable.' using errcode='42501'; end if;
  if translation.version<>expected_version then raise exception 'Translation is stale.' using errcode='40001'; end if;
  if translation.review_status<>'draft' then raise exception 'Translation transition is invalid.' using errcode='22023'; end if;
  perform private.validate_resource_translation_content(translation.title,translation.summary,translation.body);
  english_version:=private.require_translation_context(translation.resource_id);
  if translation.source_translation_version<>english_version then raise exception 'English source changed.' using errcode='40001'; end if;
  update public.resource_translations set review_status='in_review',submitted_by=actor,submitted_at=now(),updated_by=actor,version=version+1 where id=translation.id returning version into new_version;
  insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,from_review_status,to_review_status,translation_version,source_translation_version)
    values(translation.resource_id,translation.id,translation.locale,actor,'submitted','draft','in_review',new_version,english_version);
  return query select translation.id,new_version;
end;
$$;

create or replace function public.withdraw_resource_translation(target_translation_id uuid, expected_version integer)
returns table(translation_id uuid, translation_version integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); translation public.resource_translations%rowtype; english_version integer; new_version integer;
begin
  select * into translation from public.resource_translations where id=target_translation_id for update;
  if not found or translation.locale not in ('am','es') then raise exception 'Translation is unavailable.' using errcode='42501'; end if;
  if translation.version<>expected_version then raise exception 'Translation is stale.' using errcode='40001'; end if;
  if translation.review_status<>'in_review' then raise exception 'Translation transition is invalid.' using errcode='22023'; end if;
  english_version:=private.require_translation_context(translation.resource_id);
  update public.resource_translations set review_status='draft',submitted_by=null,submitted_at=null,updated_by=actor,version=version+1 where id=translation.id returning version into new_version;
  insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,from_review_status,to_review_status,translation_version,source_translation_version)
    values(translation.resource_id,translation.id,translation.locale,actor,'withdrawn','in_review','draft',new_version,english_version);
  return query select translation.id,new_version;
end;
$$;

create or replace function public.approve_resource_translation(target_translation_id uuid, expected_version integer)
returns table(translation_id uuid, translation_version integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); translation public.resource_translations%rowtype; english_version integer; new_version integer;
begin
  select * into translation from public.resource_translations where id=target_translation_id for update;
  if not found or translation.locale not in ('am','es') then raise exception 'Translation is unavailable.' using errcode='42501'; end if;
  if translation.version<>expected_version then raise exception 'Translation is stale.' using errcode='40001'; end if;
  if translation.review_status<>'in_review' or translation.submitted_by=actor then raise exception 'Translation review is unavailable.' using errcode='42501'; end if;
  english_version:=private.require_translation_context(translation.resource_id);
  if translation.source_translation_version<>english_version then raise exception 'English source changed.' using errcode='40001'; end if;
  update public.resource_translations set review_status='approved',reviewed_by=actor,reviewed_at=now(),review_note=null,updated_by=actor,version=version+1 where id=translation.id returning version into new_version;
  insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,from_review_status,to_review_status,translation_version,source_translation_version)
    values(translation.resource_id,translation.id,translation.locale,actor,'approved','in_review','approved',new_version,english_version);
  return query select translation.id,new_version;
end;
$$;

create or replace function public.reject_resource_translation(target_translation_id uuid, expected_version integer, input_rejection_note text)
returns table(translation_id uuid, translation_version integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); translation public.resource_translations%rowtype; english_version integer; new_version integer;
begin
  select * into translation from public.resource_translations where id=target_translation_id for update;
  if not found or translation.locale not in ('am','es') then raise exception 'Translation is unavailable.' using errcode='42501'; end if;
  if translation.version<>expected_version then raise exception 'Translation is stale.' using errcode='40001'; end if;
  if translation.review_status<>'in_review' or translation.submitted_by=actor then raise exception 'Translation review is unavailable.' using errcode='42501'; end if;
  if char_length(btrim(coalesce(input_rejection_note,''))) not between 10 and 1000 then raise exception 'Rejection note is invalid.' using errcode='22023'; end if;
  english_version:=private.require_translation_context(translation.resource_id);
  update public.resource_translations set review_status='draft',reviewed_by=actor,reviewed_at=now(),review_note=btrim(input_rejection_note),updated_by=actor,version=version+1 where id=translation.id returning version into new_version;
  insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,from_review_status,to_review_status,translation_version,source_translation_version)
    values(translation.resource_id,translation.id,translation.locale,actor,'rejected','in_review','draft',new_version,english_version);
  return query select translation.id,new_version;
end;
$$;

create or replace function private.invalidate_resource_translations_for_source_change(target_resource_id uuid, actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare translation public.resource_translations%rowtype; next_status text; next_version integer;
begin
  for translation in select * from public.resource_translations where resource_id=target_resource_id and locale in ('am','es') for update loop
    next_status := case when translation.review_status in ('in_review','approved') then 'draft' else translation.review_status end;
    update public.resource_translations set review_status=next_status,
      submitted_by=case when next_status='draft' then null else submitted_by end,
      submitted_at=case when next_status='draft' then null else submitted_at end,
      reviewed_by=case when next_status='draft' then null else reviewed_by end,
      reviewed_at=case when next_status='draft' then null else reviewed_at end,
      review_note=case when next_status='draft' then null else review_note end,
      updated_by=actor,version=version+1 where id=translation.id returning version into next_version;
    insert into public.resource_translation_audit_events(resource_id,translation_id,locale,actor_user_id,action,from_review_status,to_review_status,translation_version,source_translation_version)
      values(target_resource_id,translation.id,translation.locale,actor,'source_changed',translation.review_status,next_status,next_version,translation.source_translation_version);
  end loop;
end;
$$;

-- Replaces the ETH-023 update primitive so English content updates invalidate dependent translations atomically.
create or replace function public.update_resource_draft(target_resource_id uuid, expected_version integer, input_slug text, input_category text, input_title text, input_summary text, input_body text)
returns table(resource_id uuid, resource_version integer) language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); current_resource public.resources%rowtype; english public.resource_translations%rowtype; updated_version integer; content_changed boolean;
begin
  if not private.can_manage_resources() then raise exception 'Resource access is unavailable.' using errcode='42501'; end if;
  select * into current_resource from public.resources r where r.id=target_resource_id for update;
  if not found or current_resource.status<>'draft' then raise exception 'Resource is unavailable.' using errcode='42501'; end if;
  if current_resource.version<>expected_version then raise exception 'Resource is stale.' using errcode='40001'; end if;
  if current_resource.first_published_at is not null and btrim(input_slug)<>current_resource.slug then raise exception 'Published resource slugs are immutable.' using errcode='22023'; end if;
  perform private.validate_resource_content(btrim(input_slug),input_category,btrim(input_title),btrim(input_summary),btrim(input_body));
  select * into english from public.resource_translations as translation where translation.resource_id=current_resource.id and translation.locale='en' for update;
  if not found then raise exception 'Canonical resource content is unavailable.' using errcode='22023'; end if;
  content_changed := btrim(input_title)<>english.title or btrim(input_summary)<>english.summary or btrim(input_body)<>english.body;
  update public.resources set slug=btrim(input_slug),category=input_category,updated_by=actor,version=version+1 where id=current_resource.id returning version into updated_version;
  if content_changed then
    update public.resource_translations as translation set title=btrim(input_title),summary=btrim(input_summary),body=btrim(input_body),review_status='draft',reviewed_by=null,reviewed_at=null,review_note=null,updated_by=actor,version=version+1
      where translation.resource_id=current_resource.id and translation.locale='en';
    perform private.invalidate_resource_translations_for_source_change(current_resource.id,actor);
  end if;
  insert into public.resource_audit_events(resource_id,actor_user_id,action,from_status,to_status,resource_version,safe_metadata)
    values(current_resource.id,actor,'updated','draft','draft',updated_version,jsonb_build_object('fields',case when content_changed then array['slug','category','english_content'] else array['slug','category'] end));
  return query select current_resource.id, updated_version;
end;
$$;

-- Preserve source-version identity across English workflow-only transitions.  A source version changes only when
-- English title, summary, or body changes; otherwise current translations must stay current after publication.
create or replace function public.transition_resource(target_resource_id uuid, expected_version integer, input_action text, input_rejection_note text default null)
returns table(resource_id uuid, resource_version integer, resource_status public.resource_status) language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); current_resource public.resources%rowtype; english public.resource_translations%rowtype; next_status public.resource_status; next_review text; audit_action text; new_version integer; result_status public.resource_status;
begin
  if not private.can_manage_resources() then raise exception 'Resource access is unavailable.' using errcode='42501'; end if;
  select * into current_resource from public.resources r where r.id=target_resource_id for update;
  if not found or current_resource.version<>expected_version then raise exception 'Resource is stale.' using errcode='40001'; end if;
  select * into english from public.resource_translations t where t.resource_id=target_resource_id and t.locale='en' for update;
  if not found then raise exception 'Canonical resource content is unavailable.' using errcode='22023'; end if;
  if input_action in ('submit','publish') then perform private.validate_resource_content(current_resource.slug,current_resource.category,english.title,english.summary,english.body); end if;
  if input_action='submit' and current_resource.status='draft' then next_status:='in_review'; next_review:='in_review'; audit_action:='submitted';
  elsif input_action='withdraw' and current_resource.status='in_review' then next_status:='draft'; next_review:='draft'; audit_action:='withdrawn';
  elsif input_action='approve' and current_resource.status='in_review' and english.review_status='in_review' then next_status:='in_review'; next_review:='approved'; audit_action:='approved';
  elsif input_action='reject' and current_resource.status='in_review' and english.review_status='in_review' and current_resource.updated_by<>actor and char_length(btrim(coalesce(input_rejection_note,''))) between 10 and 1000 then next_status:='draft'; next_review:='draft'; audit_action:='rejected';
  elsif input_action='publish' and current_resource.status='in_review' and english.review_status='approved' then next_status:='published'; next_review:='approved'; audit_action:='published';
  elsif input_action='unpublish' and current_resource.status='published' then next_status:='draft'; next_review:='draft'; audit_action:='unpublished';
  elsif input_action='archive' and current_resource.status in ('draft','in_review','published') then next_status:='archived'; next_review:=english.review_status; audit_action:='archived';
  elsif input_action='restore' and current_resource.status='archived' then next_status:='draft'; next_review:='draft'; audit_action:='restored';
  else raise exception 'Resource transition is invalid.' using errcode='22023'; end if;
  update public.resources set status=next_status,version=version+1,updated_by=actor,
    published_by=case when audit_action='published' then actor when audit_action='unpublished' then null else published_by end,
    published_at=case when audit_action='published' then now() when audit_action='unpublished' then null else published_at end,
    first_published_at=case when audit_action='published' then coalesce(first_published_at,now()) else first_published_at end,
    archived_by=case when audit_action='archived' then actor when audit_action='restored' then null else archived_by end,
    archived_at=case when audit_action='archived' then now() when audit_action='restored' then null else archived_at end
    where id=current_resource.id returning version,status into new_version,result_status;
  update public.resource_translations as translation set review_status=next_review,
    reviewed_by=case when audit_action in ('approved','rejected') then actor when audit_action in ('unpublish','restore','withdraw') then null else translation.reviewed_by end,
    reviewed_at=case when audit_action in ('approved','rejected') then now() when audit_action in ('unpublish','restore','withdraw') then null else translation.reviewed_at end,
    review_note=case when audit_action='rejected' then btrim(input_rejection_note) when audit_action in ('unpublish','restore','withdraw') then null else translation.review_note end
    where translation.resource_id=current_resource.id and translation.locale='en';
  insert into public.resource_audit_events(resource_id,actor_user_id,action,from_status,to_status,resource_version,safe_metadata)
    values(current_resource.id,actor,audit_action,current_resource.status,result_status,new_version,case when audit_action='rejected' then jsonb_build_object('rejection_note',btrim(input_rejection_note)) else '{}'::jsonb end);
  return query select current_resource.id,new_version,result_status;
end;
$$;

create or replace function public.create_resource_draft(input_slug text, input_category text, input_title text, input_summary text, input_body text, input_idempotency_key uuid)
returns table(resource_id uuid, resource_version integer) language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); existing public.resources%rowtype; created_id uuid;
begin
  if not private.can_manage_resources() then raise exception 'Resource access is unavailable.' using errcode='42501'; end if;
  perform private.validate_resource_content(btrim(input_slug), input_category, btrim(input_title), btrim(input_summary), btrim(input_body));
  if input_idempotency_key is not null then select * into existing from public.resources r where r.author_id=actor and r.idempotency_key=input_idempotency_key; if found then return query select existing.id,existing.version; return; end if; end if;
  insert into public.resources(slug,category,status,author_id,updated_by,idempotency_key) values(btrim(input_slug),input_category,'draft',actor,actor,input_idempotency_key)
    on conflict (author_id,idempotency_key) where idempotency_key is not null do nothing returning id into created_id;
  if created_id is null then select id into created_id from public.resources where author_id=actor and idempotency_key=input_idempotency_key; return query select created_id,(select version from public.resources where id=created_id); return; end if;
  insert into public.resource_translations(resource_id,locale,title,summary,body,review_status,created_by,updated_by)
    values(created_id,'en',btrim(input_title),btrim(input_summary),btrim(input_body),'draft',actor,actor);
  insert into public.resource_audit_events(resource_id,actor_user_id,action,to_status,resource_version) values(created_id,actor,'created','draft',1);
  return query select created_id,1;
end;
$$;

-- Reader-safe public payloads: the underlying workflow rows are never public.
create or replace function public.list_published_resources(input_locale text, input_category text default null)
returns table(slug text, category text, published_at timestamptz, title text, summary text, selected_locale text, using_english_fallback boolean)
language sql stable security definer set search_path='' as $$
  select r.slug,r.category,r.published_at,coalesce(localized.title,en.title),coalesce(localized.summary,en.summary),
    coalesce(localized.locale,'en'),(input_locale<>'en' and localized.id is null)
  from public.resources r
  join public.resource_translations en on en.resource_id=r.id and en.locale='en' and en.review_status='approved'
  left join public.resource_translations localized on localized.resource_id=r.id and localized.locale=input_locale and input_locale in ('am','es')
    and localized.review_status='approved' and localized.source_translation_version=en.version
  where input_locale in ('en','am','es') and r.status='published' and r.archived_at is null
    and (input_category is null or r.category=input_category)
  order by r.published_at desc nulls last, r.id;
$$;

create or replace function public.get_published_resource(input_slug text, input_locale text)
returns table(slug text, category text, published_at timestamptz, title text, summary text, body text, selected_locale text, using_english_fallback boolean)
language sql stable security definer set search_path='' as $$
  select r.slug,r.category,r.published_at,coalesce(localized.title,en.title),coalesce(localized.summary,en.summary),coalesce(localized.body,en.body),
    coalesce(localized.locale,'en'),(input_locale<>'en' and localized.id is null)
  from public.resources r
  join public.resource_translations en on en.resource_id=r.id and en.locale='en' and en.review_status='approved'
  left join public.resource_translations localized on localized.resource_id=r.id and localized.locale=input_locale and input_locale in ('am','es')
    and localized.review_status='approved' and localized.source_translation_version=en.version
  where input_locale in ('en','am','es') and r.slug=input_slug and r.status='published' and r.archived_at is null;
$$;

revoke all on function public.create_resource_translation_draft(uuid,text,text,text,text), public.update_resource_translation_draft(uuid,integer,text,text,text), public.submit_resource_translation(uuid,integer), public.withdraw_resource_translation(uuid,integer), public.approve_resource_translation(uuid,integer), public.reject_resource_translation(uuid,integer,text), public.list_published_resources(text,text), public.get_published_resource(text,text) from public, anon;
grant execute on function public.create_resource_translation_draft(uuid,text,text,text,text), public.update_resource_translation_draft(uuid,integer,text,text,text), public.submit_resource_translation(uuid,integer), public.withdraw_resource_translation(uuid,integer), public.approve_resource_translation(uuid,integer), public.reject_resource_translation(uuid,integer,text) to authenticated;
grant execute on function public.list_published_resources(text,text), public.get_published_resource(text,text) to anon, authenticated;
