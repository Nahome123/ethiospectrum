begin;

select no_plan();

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000','26000000-0000-0000-0000-000000000001','authenticated','authenticated','resource-hub-admin@example.test','not-a-real-password',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','26000000-0000-0000-0000-000000000002','authenticated','authenticated','resource-hub-member@example.test','not-a-real-password',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','26000000-0000-0000-0000-000000000003','authenticated','authenticated','resource-hub-other@example.test','not-a-real-password',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','26000000-0000-0000-0000-000000000004','authenticated','authenticated','resource-hub-viewer@example.test','not-a-real-password',now(),'{}','{}',now(),now());

update public.user_roles set role='administrator' where user_id='26000000-0000-0000-0000-000000000001';

insert into public.households(id,name,primary_owner_id,created_by)
values('36000000-0000-0000-0000-000000000001','Resource discovery household','26000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000002');

insert into public.household_members(household_id,user_id,relationship,permission,status,joined_at)
values
  ('36000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000002','Parent','owner','active',now()),
  ('36000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000004','Observer','viewer','active',now());

insert into public.resources(id,slug,category,status,author_id,updated_by,published_at,first_published_at,resource_type,featured_rank)
values
  ('46000000-0000-0000-0000-000000000001','member-featured-guide','education','published','26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001',now(),now(),'guide',1),
  ('46000000-0000-0000-0000-000000000002','member-latest-video','healthcare','published','26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001',now() - interval '1 day',now() - interval '1 day','video',null),
  ('46000000-0000-0000-0000-000000000003','member-private-draft','education','draft','26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001',null,null,'article',null);

insert into public.resource_translations(resource_id,locale,title,summary,body,review_status,version,source_translation_version,created_by,updated_by)
values
  ('46000000-0000-0000-0000-000000000001','en','Featured education guide','A reviewed education guide for the member discovery database test.','This reviewed education guide body is long enough to exercise the protected member resource detail reader.','approved',1,null,'26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001'),
  ('46000000-0000-0000-0000-000000000001','es','Guía educativa destacada','Una guía educativa revisada para la prueba de descubrimiento de miembros.','Este contenido de guía educativa revisada es suficientemente largo para probar la vista protegida del recurso.','approved',1,1,'26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001'),
  ('46000000-0000-0000-0000-000000000002','en','Latest healthcare video','A reviewed healthcare video for the member discovery database test.','This reviewed healthcare video body is long enough to exercise the protected member resource detail reader.','approved',1,null,'26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001'),
  ('46000000-0000-0000-0000-000000000003','en','Private draft article','A draft article that must stay outside the member resource catalog.','This private draft article body must never become visible through any member resource discovery reader function.','draft',1,null,'26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001');

insert into public.resource_account_access(resource_id,user_id,assigned_by)
values('46000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000001');

select has_column('public','resources','resource_type','resources store a controlled discovery type');
select has_column('public','resources','featured_rank','resources store optional editorial ordering');
select has_table('public','resource_bookmarks','private member bookmarks exist');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.resource_bookmarks'::regclass),'bookmark RLS is enabled and forced');
select function_privs_are('public','list_member_resources',array['text','text','text','text','boolean','boolean','boolean','integer','integer'],'authenticated',array['EXECUTE'],'authenticated members can execute resource discovery');

set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-0000-0000-000000000002';

select is((select count(*) from public.list_member_resources('en',null,null,null,false,false,false,1,12)),2::bigint,'member catalog returns only published approved resources');
select is((select title from public.list_member_resources('es',null,'education','guide',false,false,true,1,12)),'Guía educativa destacada','catalog selects a current approved Spanish translation');
select is((select using_english_fallback from public.list_member_resources('am',null,'education',null,false,false,false,1,12)),true,'catalog reports an English fallback when Amharic is unavailable');
select is((select count(*) from public.list_member_resources('en','healthcare video',null,null,false,false,false,1,12)),1::bigint,'bounded title and summary search filters results');
select is((select is_assigned from public.list_member_resources('en',null,null,null,false,true,false,1,12)),true,'assigned-only discovery powers the For you lane');
select is((select count(*) from public.list_member_resources('en',null,null,null,false,false,true,1,12)),1::bigint,'featured-only discovery returns curated resources');
select throws_ok($$select * from public.list_member_resources('fr',null,null,null,false,false,false,1,12)$$,'22023',null,'member catalog rejects unsupported locales');
select throws_ok($$select * from public.list_member_resources('en',repeat('x',101),null,null,false,false,false,1,12)$$,'22023',null,'member catalog rejects oversized search input');

select is(public.set_resource_bookmark('member-featured-guide',true),true,'member can save a published resource');
select is((select count(*) from public.resource_bookmarks),1::bigint,'member can read exactly their own saved row');
select is((select count(*) from public.list_member_resources('en',null,null,null,true,false,false,1,12)),1::bigint,'saved-only catalog returns the bookmark');
select is((select is_bookmarked from public.get_member_resource('member-featured-guide','en')),true,'member detail reports bookmark state');
select is(public.set_resource_bookmark('member-featured-guide',false),false,'member can remove a saved resource');
select throws_ok($$select public.set_resource_bookmark('member-private-draft',true)$$,'42501',null,'draft resources cannot be bookmarked');

select is((select already_exists from public.add_resource_to_roadmap('member-featured-guide','en')),false,'resource creates a new roadmap item once');
select is((select already_exists from public.add_resource_to_roadmap('member-featured-guide','en')),true,'repeated resource addition is idempotent');
select is((select count(*) from public.roadmap_items where source_type='resource' and source_id='46000000-0000-0000-0000-000000000001'),1::bigint,'one source-linked roadmap item is stored');
select is((select is_on_roadmap from public.get_member_resource('member-featured-guide','en')),true,'member detail reports roadmap state');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-0000-0000-000000000003';
select is((select count(*) from public.resource_bookmarks),0::bigint,'another account cannot enumerate someone else bookmarks');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-0000-0000-000000000004';
select throws_ok($$select * from public.add_resource_to_roadmap('member-featured-guide','en')$$,'42501',null,'household viewers cannot add resources to a roadmap');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-0000-0000-000000000002';
select throws_ok($$select * from public.update_resource_discovery_metadata('46000000-0000-0000-0000-000000000001',1,'template',2)$$,'42501',null,'regular members cannot curate discovery metadata');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.update_resource_discovery_metadata('46000000-0000-0000-0000-000000000001',1,'template',2)$$,'administrator updates discovery metadata');
select is((select resource_type from public.resources where id='46000000-0000-0000-0000-000000000001'),'template','controlled resource type is stored');
select is((select featured_rank from public.resources where id='46000000-0000-0000-0000-000000000001'),2::smallint,'controlled featured position is stored');
select is((select count(*) from public.resource_audit_events where resource_id='46000000-0000-0000-0000-000000000001' and action='discovery_metadata_updated'),1::bigint,'curation change creates an audit event');
select throws_ok($$select * from public.update_resource_discovery_metadata('46000000-0000-0000-0000-000000000001',2,'unsafe',null)$$,'22023',null,'curation rejects unsupported resource types');

reset role;
set local role anon;
select throws_ok($$select * from public.list_member_resources('en',null,null,null,false,false,false,1,12)$$,'42501',null,'anonymous callers cannot execute member discovery');
select throws_ok($$select public.set_resource_bookmark('member-featured-guide',true)$$,'42501',null,'anonymous callers cannot update bookmarks');

select * from finish();
rollback;
