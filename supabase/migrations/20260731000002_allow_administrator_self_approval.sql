-- Administrators own the complete resource workflow, including approval of their own submissions.
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
  elsif input_action='reject' and current_resource.status='in_review' and english.review_status='in_review' and char_length(btrim(coalesce(input_rejection_note,''))) between 10 and 1000 then next_status:='draft'; next_review:='draft'; audit_action:='rejected';
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
    review_note=case when audit_action='rejected' then btrim(input_rejection_note) when audit_action in ('unpublish','restore','withdraw') then null else translation.review_note end,
    version=translation.version+1 where translation.resource_id=current_resource.id and translation.locale='en';
  insert into public.resource_audit_events(resource_id,actor_user_id,action,from_status,to_status,resource_version,safe_metadata)
    values(current_resource.id,actor,audit_action,current_resource.status,result_status,new_version,case when audit_action='rejected' then jsonb_build_object('rejection_note',btrim(input_rejection_note)) else '{}'::jsonb end);
  return query select current_resource.id,new_version,result_status;
end;
$$;
