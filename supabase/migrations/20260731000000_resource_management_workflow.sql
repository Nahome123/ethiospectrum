-- ETH-023: canonical-English resource editorial workflow. ETH-024 owns other locales.
alter table public.resources
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists published_by uuid references public.profiles(id),
  add column if not exists first_published_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archived_at timestamptz,
  add column if not exists idempotency_key uuid,
  add column if not exists version integer not null default 1;
alter table public.resource_translations
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists version integer not null default 1;

alter table public.resources
  add constraint resources_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 120),
  add constraint resources_category_allowed check (category in ('general','healthcare','education','therapy','benefits','legal','family_support','other')),
  add constraint resources_version_positive check (version > 0);
alter table public.resource_translations
  add constraint resource_translation_content_bounds check (char_length(title) between 3 and 160 and char_length(summary) between 10 and 500 and char_length(body) between 50 and 50000),
  add constraint resource_translation_version_positive check (version > 0),
  add constraint resource_translation_review_note_bounds check (review_note is null or char_length(review_note) between 10 and 1000);
create unique index if not exists resources_slug_lower_unique on public.resources(lower(slug));
create unique index if not exists resources_author_idempotency_unique on public.resources(author_id, idempotency_key) where idempotency_key is not null;
create index if not exists resources_public_catalog_idx on public.resources(category, published_at desc, id) where status='published' and archived_at is null;

create table public.resource_audit_events (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id),
  action text not null check (action in ('created','updated','submitted','withdrawn','approved','rejected','published','unpublished','archived','restored')),
  from_status public.resource_status,
  to_status public.resource_status,
  resource_version integer not null check (resource_version > 0),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.resources enable row level security;
alter table public.resources force row level security;
alter table public.resource_translations enable row level security;
alter table public.resource_translations force row level security;
alter table public.resource_audit_events enable row level security;
alter table public.resource_audit_events force row level security;

create or replace function private.can_manage_resources()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.current_app_role() in ('content_editor'::public.app_role,'administrator'::public.app_role), false);
$$;
drop policy if exists published_resources_read on public.resources;
drop policy if exists resource_editor_write on public.resources;
drop policy if exists resource_translations_read on public.resource_translations;
drop policy if exists resource_translations_editor_write on public.resource_translations;
create policy resources_published_read on public.resources for select using ((status='published' and archived_at is null) or private.can_manage_resources());
create policy resource_translations_read on public.resource_translations for select using (private.can_manage_resources() or (locale='en' and review_status='approved' and exists (select 1 from public.resources r where r.id=resource_id and r.status='published' and r.archived_at is null)));
create policy resource_audit_events_editor_read on public.resource_audit_events for select using (private.can_manage_resources());
revoke all on public.resources, public.resource_translations, public.resource_audit_events from anon, authenticated;
grant select on public.resources, public.resource_translations to anon, authenticated;
grant select on public.resource_audit_events to authenticated;

create or replace function private.validate_resource_content(input_slug text, input_category text, input_title text, input_summary text, input_body text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if input_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(input_slug) not between 3 and 120
    or input_category not in ('general','healthcare','education','therapy','benefits','legal','family_support','other')
    or char_length(input_title) not between 3 and 160 or char_length(input_summary) not between 10 and 500
    or char_length(input_body) not between 50 and 50000 then
    raise exception 'Resource content is invalid.' using errcode='22023';
  end if;
end;
$$;

create or replace function public.create_resource_draft(input_slug text, input_category text, input_title text, input_summary text, input_body text, input_idempotency_key uuid)
returns table(resource_id uuid, resource_version integer) language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); existing public.resources%rowtype; created_id uuid;
begin
  if not private.can_manage_resources() then raise exception 'Resource access is unavailable.' using errcode='42501'; end if;
  perform private.validate_resource_content(btrim(input_slug), input_category, btrim(input_title), btrim(input_summary), btrim(input_body));
  if input_idempotency_key is not null then
    select * into existing from public.resources r where r.author_id=actor and r.idempotency_key=input_idempotency_key;
    if found then return query select existing.id, existing.version; return; end if;
  end if;
  insert into public.resources(slug,category,status,author_id,updated_by,idempotency_key)
    values (btrim(input_slug),input_category,'draft',actor,actor,input_idempotency_key)
    on conflict (author_id,idempotency_key) where idempotency_key is not null do nothing
    returning id into created_id;
  if created_id is null then
    select id into created_id from public.resources where author_id=actor and idempotency_key=input_idempotency_key;
    return query select created_id, (select version from public.resources where id=created_id);
    return;
  end if;
  insert into public.resource_translations(resource_id,locale,title,summary,body,review_status)
    values (created_id,'en',btrim(input_title),btrim(input_summary),btrim(input_body),'draft');
  insert into public.resource_audit_events(resource_id,actor_user_id,action,to_status,resource_version)
    values (created_id,actor,'created','draft',1);
  return query select created_id, 1;
end;
$$;

create or replace function public.update_resource_draft(target_resource_id uuid, expected_version integer, input_slug text, input_category text, input_title text, input_summary text, input_body text)
returns table(resource_id uuid, resource_version integer) language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); current_resource public.resources%rowtype; updated_version integer;
begin
  if not private.can_manage_resources() then raise exception 'Resource access is unavailable.' using errcode='42501'; end if;
  select * into current_resource from public.resources r where r.id=target_resource_id for update;
  if not found or current_resource.status<>'draft' then raise exception 'Resource is unavailable.' using errcode='42501'; end if;
  if current_resource.version<>expected_version then raise exception 'Resource is stale.' using errcode='40001'; end if;
  if current_resource.first_published_at is not null and btrim(input_slug)<>current_resource.slug then raise exception 'Published resource slugs are immutable.' using errcode='22023'; end if;
  perform private.validate_resource_content(btrim(input_slug),input_category,btrim(input_title),btrim(input_summary),btrim(input_body));
  update public.resources set slug=btrim(input_slug),category=input_category,updated_by=actor,version=version+1
    where id=current_resource.id returning version into updated_version;
  update public.resource_translations set title=btrim(input_title),summary=btrim(input_summary),body=btrim(input_body),review_status='draft',reviewed_by=null,reviewed_at=null,review_note=null,version=version+1
    where resource_id=current_resource.id and locale='en';
  insert into public.resource_audit_events(resource_id,actor_user_id,action,from_status,to_status,resource_version,safe_metadata)
    values(current_resource.id,actor,'updated','draft','draft',updated_version,jsonb_build_object('fields',array['slug','category','english_content']));
  return query select current_resource.id, updated_version;
end;
$$;

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
  elsif input_action='approve' and current_resource.status='in_review' and english.review_status='in_review' and current_resource.updated_by<>actor then next_status:='in_review'; next_review:='approved'; audit_action:='approved';
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
  update public.resource_translations set review_status=next_review,
    reviewed_by=case when audit_action in ('approved','rejected') then actor when audit_action in ('unpublish','restore','withdraw') then null else reviewed_by end,
    reviewed_at=case when audit_action in ('approved','rejected') then now() when audit_action in ('unpublish','restore','withdraw') then null else reviewed_at end,
    review_note=case when audit_action='rejected' then btrim(input_rejection_note) when audit_action in ('unpublish','restore','withdraw') then null else review_note end,
    version=version+1 where resource_id=current_resource.id and locale='en';
  insert into public.resource_audit_events(resource_id,actor_user_id,action,from_status,to_status,resource_version,safe_metadata)
    values(current_resource.id,actor,audit_action,current_resource.status,result_status,new_version,case when audit_action='rejected' then jsonb_build_object('rejection_note',btrim(input_rejection_note)) else '{}'::jsonb end);
  return query select current_resource.id,new_version,result_status;
end;
$$;

create or replace function public.submit_resource_for_review(target_resource_id uuid, expected_version integer) returns table(resource_id uuid, resource_version integer, resource_status public.resource_status) language sql security definer set search_path='' as $$ select * from public.transition_resource(target_resource_id,expected_version,'submit',null); $$;
create or replace function public.withdraw_resource_review(target_resource_id uuid, expected_version integer) returns table(resource_id uuid, resource_version integer, resource_status public.resource_status) language sql security definer set search_path='' as $$ select * from public.transition_resource(target_resource_id,expected_version,'withdraw',null); $$;
create or replace function public.approve_resource(target_resource_id uuid, expected_version integer) returns table(resource_id uuid, resource_version integer, resource_status public.resource_status) language sql security definer set search_path='' as $$ select * from public.transition_resource(target_resource_id,expected_version,'approve',null); $$;
create or replace function public.reject_resource(target_resource_id uuid, expected_version integer, input_rejection_note text) returns table(resource_id uuid, resource_version integer, resource_status public.resource_status) language sql security definer set search_path='' as $$ select * from public.transition_resource(target_resource_id,expected_version,'reject',input_rejection_note); $$;
create or replace function public.publish_resource(target_resource_id uuid, expected_version integer) returns table(resource_id uuid, resource_version integer, resource_status public.resource_status) language sql security definer set search_path='' as $$ select * from public.transition_resource(target_resource_id,expected_version,'publish',null); $$;
create or replace function public.unpublish_resource(target_resource_id uuid, expected_version integer) returns table(resource_id uuid, resource_version integer, resource_status public.resource_status) language sql security definer set search_path='' as $$ select * from public.transition_resource(target_resource_id,expected_version,'unpublish',null); $$;
create or replace function public.archive_resource(target_resource_id uuid, expected_version integer) returns table(resource_id uuid, resource_version integer, resource_status public.resource_status) language sql security definer set search_path='' as $$ select * from public.transition_resource(target_resource_id,expected_version,'archive',null); $$;
create or replace function public.restore_resource(target_resource_id uuid, expected_version integer) returns table(resource_id uuid, resource_version integer, resource_status public.resource_status) language sql security definer set search_path='' as $$ select * from public.transition_resource(target_resource_id,expected_version,'restore',null); $$;
revoke all on function public.create_resource_draft(text,text,text,text,text,uuid), public.update_resource_draft(uuid,integer,text,text,text,text,text), public.transition_resource(uuid,integer,text,text), public.submit_resource_for_review(uuid,integer), public.withdraw_resource_review(uuid,integer), public.approve_resource(uuid,integer), public.reject_resource(uuid,integer,text), public.publish_resource(uuid,integer), public.unpublish_resource(uuid,integer), public.archive_resource(uuid,integer), public.restore_resource(uuid,integer) from public,anon;
grant execute on function public.create_resource_draft(text,text,text,text,text,uuid), public.update_resource_draft(uuid,integer,text,text,text,text,text), public.transition_resource(uuid,integer,text,text), public.submit_resource_for_review(uuid,integer), public.withdraw_resource_review(uuid,integer), public.approve_resource(uuid,integer), public.reject_resource(uuid,integer,text), public.publish_resource(uuid,integer), public.unpublish_resource(uuid,integer), public.archive_resource(uuid,integer), public.restore_resource(uuid,integer) to authenticated;
