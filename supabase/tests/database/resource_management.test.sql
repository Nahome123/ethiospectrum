begin;

select plan(25);

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000','23000000-0000-0000-0000-000000000001','authenticated','authenticated','resource-editor@example.test','not-a-real-password',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','23000000-0000-0000-0000-000000000002','authenticated','authenticated','resource-reviewer@example.test','not-a-real-password',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','23000000-0000-0000-0000-000000000003','authenticated','authenticated','resource-member@example.test','not-a-real-password',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','23000000-0000-0000-0000-000000000004','authenticated','authenticated','resource-admin@example.test','not-a-real-password',now(),'{}','{}',now(),now());
update public.user_roles set role='administrator' where user_id in ('23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000004');

select has_table('public','resource_audit_events','resource audit table exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.resource_audit_events'::regclass),'resource audit RLS is enabled and forced');

set local role authenticated;
set local request.jwt.claim.sub='23000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.create_resource_draft('family-school-meeting','education','Preparing for a school meeting','A practical guide for preparing useful questions before a school meeting.','This is a sufficiently long canonical English resource body that is safe to submit for editorial review.','33000000-0000-4000-8000-000000000001')$$,'editor can create a canonical-English draft');
select is((select count(*) from public.resources where slug='family-school-meeting'),1::bigint,'create stores one resource');
select lives_ok($$select * from public.create_resource_draft('family-school-meeting','education','Preparing for a school meeting','A practical guide for preparing useful questions before a school meeting.','This is a sufficiently long canonical English resource body that is safe to submit for editorial review.','33000000-0000-4000-8000-000000000001')$$,'repeat create is idempotent');
select is((select count(*) from public.resources where slug='family-school-meeting'),1::bigint,'idempotent create does not duplicate a resource');
select is((select count(*) from public.resource_translations where locale='en'),1::bigint,'draft has exactly one English translation');
select lives_ok($$select * from public.submit_resource_for_review((select id from public.resources where slug='family-school-meeting'),1)$$,'editor can submit a draft');
select throws_ok($$select * from public.approve_resource((select id from public.resources where slug='family-school-meeting'),2)$$,'22023',null,'submitting editor cannot approve the same submitted version');
select throws_ok($$select * from public.update_resource_draft((select id from public.resources where slug='family-school-meeting'),1,'family-school-meeting','education','Preparing for a school meeting','A practical guide for preparing useful questions before a school meeting.','This is a sufficiently long canonical English resource body that is safe to submit for editorial review.')$$,'42501',null,'in-review resource cannot be edited as a draft');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='23000000-0000-0000-0000-000000000002';
select lives_ok($$select * from public.approve_resource((select id from public.resources where slug='family-school-meeting'),2)$$,'a different editor can approve');
select is((select review_status from public.resource_translations where resource_id=(select id from public.resources where slug='family-school-meeting') and locale='en'),'approved','approval applies to English content');
select lives_ok($$select * from public.publish_resource((select id from public.resources where slug='family-school-meeting'),3)$$,'approved resource can publish');
select isnt((select first_published_at from public.resources where slug='family-school-meeting'),null::timestamptz,'first publication is recorded');

reset role;
set local role anon;
select is((select count(*) from public.resources where slug='family-school-meeting'),1::bigint,'anonymous readers see a published resource');
select is((select count(*) from public.resource_translations where resource_id=(select id from public.resources where slug='family-school-meeting') and locale='en'),1::bigint,'anonymous readers see approved English content');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='23000000-0000-0000-0000-000000000004';
select lives_ok($$select * from public.unpublish_resource((select id from public.resources where slug='family-school-meeting'),4)$$,'administrator can unpublish');
select is((select count(*) from public.resources where slug='family-school-meeting' and first_published_at is not null),1::bigint,'unpublish preserves first publication evidence');
select throws_ok($$select * from public.update_resource_draft((select id from public.resources where slug='family-school-meeting'),5,'changed-slug','education','Preparing for a school meeting','A practical guide for preparing useful questions before a school meeting.','This is a sufficiently long canonical English resource body that is safe to submit for editorial review.')$$,'22023',null,'slug cannot change after first publication');
select lives_ok($$select * from public.archive_resource((select id from public.resources where slug='family-school-meeting'),5)$$,'administrator can archive a draft');
select is((select count(*) from public.resources where slug='family-school-meeting' and status='archived'),1::bigint,'archive is a soft state');
select lives_ok($$select * from public.restore_resource((select id from public.resources where slug='family-school-meeting'),6)$$,'administrator can restore an archive to draft');
select is((select status from public.resources where slug='family-school-meeting'),'draft'::public.resource_status,'restore returns to draft without auto-publishing');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='23000000-0000-0000-0000-000000000003';
select throws_ok($$select * from public.create_resource_draft('member-resource','general','Member resource title','A practical guide that a member must not be able to create directly.','This is a sufficiently long body proving that a standard member has no resource editorial permission.','33000000-0000-4000-8000-000000000002')$$,'42501',null,'ordinary members cannot create resources');
select is((select count(*) from public.resource_audit_events),0::bigint,'ordinary members cannot read editorial audit data');

select * from finish();
rollback;
