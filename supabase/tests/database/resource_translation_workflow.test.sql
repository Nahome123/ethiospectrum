begin;

select plan(24);

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000','24000000-0000-0000-0000-000000000001','authenticated','authenticated','translation-author@example.test','not-a-real-password',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','24000000-0000-0000-0000-000000000002','authenticated','authenticated','translation-reviewer@example.test','not-a-real-password',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','24000000-0000-0000-0000-000000000003','authenticated','authenticated','translation-member@example.test','not-a-real-password',now(),'{}','{}',now(),now());
update public.user_roles set role='content_editor' where user_id in ('24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002');

select has_table('public','resource_translation_audit_events','translation audits reuse the resource workflow boundary');
select has_column('public','resource_translations','source_translation_version','source version is stored on translations');
select has_column('public','resource_translations','submitted_by','submitter is stored server-side');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.resource_translation_audit_events'::regclass),'translation audit RLS is enabled and forced');
select ok((select indexdef like '%(resource_id, locale)%' from pg_indexes where schemaname='public' and tablename='resource_translations' and indexname like '%resource_id_locale%'),'resource-locale uniqueness exists');

set local role authenticated;
set local request.jwt.claim.sub='24000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.create_resource_draft('translation-resource','education','Canonical English title','A canonical English summary that is long enough for workflow validation.','This canonical English resource body is deliberately long enough to satisfy the resource workflow validation requirement.','44000000-0000-4000-8000-000000000001')$$,'editor creates canonical source');
select lives_ok($$select * from public.submit_resource_for_review((select id from public.resources where slug='translation-resource'),1)$$,'English source enters review');
select lives_ok($$select * from public.approve_resource((select id from public.resources where slug='translation-resource'),2)$$,'English source is approved');
select lives_ok($$select * from public.create_resource_translation_draft((select id from public.resources where slug='translation-resource'),'am','የአማርኛ ርዕስ','ይህ በቂ የአማርኛ ማጠቃለያ ሲሆን ለማረጋገጫ ይጠቅማል።','ይህ በቂ ርዝመት ያለው የአማርኛ የሀብት አካል ነው፣ እና የዩኒኮድ ይዘት መደገፉን ያረጋግጣል።')$$,'content editor creates an Amharic draft');
select lives_ok($$select * from public.create_resource_translation_draft((select id from public.resources where slug='translation-resource'),'es','Título en español','Este resumen en español es suficientemente largo para la validación.','Este cuerpo de recurso en español tiene una longitud suficiente para validar el flujo de traducción y el contenido Unicode.')$$,'content editor creates a Spanish draft');
select throws_ok($$select * from public.create_resource_translation_draft((select id from public.resources where slug='translation-resource'),'en','English title','This summary is deliberately long enough for validation.','This English body is deliberately long enough for validation and must not be created by ETH-024.')$$,'22023',null,'translation functions reject English mutation');
select throws_ok($$select * from public.create_resource_translation_draft((select id from public.resources where slug='translation-resource'),'fr','Titre français','Ce résumé est suffisamment long pour la validation.','Ce texte français est suffisamment long pour la validation du flux de traduction.')$$,'22023',null,'translation functions reject unsupported locales');
select lives_ok($$select * from public.submit_resource_translation((select id from public.resource_translations where resource_id=(select id from public.resources where slug='translation-resource') and locale='am'),1)$$,'draft submits with server-derived source version');
select throws_ok($$select * from public.approve_resource_translation((select id from public.resource_translations where resource_id=(select id from public.resources where slug='translation-resource') and locale='am'),2)$$,'42501',null,'submitter cannot approve their own translation');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='24000000-0000-0000-0000-000000000002';
select lives_ok($$select * from public.approve_resource_translation((select id from public.resource_translations where resource_id=(select id from public.resources where slug='translation-resource') and locale='am'),2)$$,'different editor approves translation');
select is((select review_status from public.resource_translations where resource_id=(select id from public.resources where slug='translation-resource') and locale='am'),'approved','approved translation stores approved status');
select is((select count(*) from public.resource_translation_audit_events where action in ('created','submitted','approved')),4::bigint,'workflow creates immutable translation audit events');
select lives_ok($$select * from public.publish_resource((select id from public.resources where slug='translation-resource'),3)$$,'approved English resource publishes');

reset role;
set local role anon;
select is((select title from public.list_published_resources('am',null) where slug='translation-resource'),'የአማርኛ ርዕስ','approved current Amharic content is selected publicly');
select throws_ok($$select count(*) from public.resource_translation_audit_events$$,'42501',null,'anonymous reader cannot see translation audit records');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='24000000-0000-0000-0000-000000000002';
select lives_ok($$select * from public.unpublish_resource((select id from public.resources where slug='translation-resource'),4)$$,'resource unpublishes for canonical update');
select lives_ok($$select * from public.update_resource_draft((select id from public.resources where slug='translation-resource'),5,'translation-resource','education','Changed canonical title','A changed canonical English summary that is long enough for workflow validation.','This changed canonical English resource body is deliberately long enough to invalidate translations safely.')$$,'English content update invalidates translations atomically');
select is((select review_status from public.resource_translations where resource_id=(select id from public.resources where slug='translation-resource') and locale='am'),'draft','English change resets approved translation to draft');
select ok((select source_translation_version <> (select version from public.resource_translations where resource_id=(select id from public.resources where slug='translation-resource') and locale='en') from public.resource_translations where resource_id=(select id from public.resources where slug='translation-resource') and locale='am'),'English change makes translation stale');

select * from finish();
rollback;
