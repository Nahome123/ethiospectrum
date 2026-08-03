begin;

select no_plan();

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','25000000-0000-0000-0000-000000000001','authenticated','authenticated','reader-invalidation-editor@example.test','not-a-real-password',now(),'{}','{}',now(),now());
update public.user_roles set role='administrator' where user_id='25000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.create_resource_draft('reader-selection','education','Canonical English title','A canonical English summary that is long enough for reader tests.','This canonical English body is deliberately long enough to support public reader-selection regression coverage.','45000000-0000-4000-8000-000000000001')$$,'reader fixture canonical source is created');
select lives_ok($$select * from public.submit_resource_for_review((select id from public.resources where slug='reader-selection'),1)$$,'reader fixture submits');
select lives_ok($$select * from public.approve_resource((select id from public.resources where slug='reader-selection'),2)$$,'reader fixture English is approved');
select lives_ok($$select * from public.publish_resource((select id from public.resources where slug='reader-selection'),3)$$,'reader fixture publishes');

reset role;
insert into public.resource_translations(resource_id,locale,title,summary,body,review_status,source_translation_version,created_by,updated_by,reviewed_by,reviewed_at)
values
  ((select id from public.resources where slug='reader-selection'),'am','የአማርኛ ርዕስ','ይህ በቂ ርዝመት ያለው የአማርኛ ማጠቃለያ ነው።','ይህ የአማርኛ ይዘት በቂ ርዝመት ያለው ሲሆን ለአንባቢ ምርጫ ሙከራ ይጠቅማል። ተጨማሪ የሙከራ ይዘት እዚህ ተቀምጧል።','approved',1,'25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001',now()),
  ((select id from public.resources where slug='reader-selection'),'es','Título en español','Este resumen en español tiene longitud suficiente para las pruebas.','Este cuerpo en español tiene una longitud suficiente para comprobar la selección pública de recursos traducidos.','approved',1,'25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001',now());

set local role anon;
select is((select selected_locale from public.get_published_resource('reader-selection','en')),'en','English detail selects canonical English');
select is((select title from public.get_published_resource('reader-selection','en')),'Canonical English title','English detail returns the English title');
select is((select summary from public.get_published_resource('reader-selection','en')),'A canonical English summary that is long enough for reader tests.','English detail returns the English summary');
select ok((select body like 'This canonical English body%' from public.get_published_resource('reader-selection','en')),'English detail returns the English body');
select is((select using_english_fallback from public.get_published_resource('reader-selection','en')),false,'English detail has no fallback');
select is((select selected_locale from public.list_published_resources('en',null) where slug='reader-selection'),'en','English catalog selects English');
select is((select title from public.get_published_resource('reader-selection','am')),'የአማርኛ ርዕስ','current approved Amharic detail is selected');
select is((select summary from public.get_published_resource('reader-selection','am')),'ይህ በቂ ርዝመት ያለው የአማርኛ ማጠቃለያ ነው።','Amharic detail returns translated summary');
select ok((select body like 'ይህ የአማርኛ ይዘት%' from public.get_published_resource('reader-selection','am')),'Amharic detail returns translated body');
select is((select selected_locale from public.get_published_resource('reader-selection','am')),'am','Amharic detail identifies Amharic');
select is((select using_english_fallback from public.get_published_resource('reader-selection','am')),false,'current Amharic has no fallback');
select is((select title from public.list_published_resources('am',null) where slug='reader-selection'),'የአማርኛ ርዕስ','Amharic catalog uses translated title');
select is((select title from public.get_published_resource('reader-selection','es')),'Título en español','current approved Spanish detail is selected');
select is((select summary from public.get_published_resource('reader-selection','es')),'Este resumen en español tiene longitud suficiente para las pruebas.','Spanish detail returns translated summary');
select ok((select body like 'Este cuerpo en español%' from public.get_published_resource('reader-selection','es')),'Spanish detail returns translated body');
select is((select selected_locale from public.get_published_resource('reader-selection','es')),'es','Spanish detail identifies Spanish');
select is((select using_english_fallback from public.get_published_resource('reader-selection','es')),false,'current Spanish has no fallback');
select is((select title from public.list_published_resources('es',null) where slug='reader-selection'),'Título en español','Spanish catalog uses translated title');
select is((select count(*) from public.list_published_resources('en','education') where slug='reader-selection'),1::bigint,'catalog category filter includes a match once');
select is((select count(*) from public.list_published_resources('en','healthcare') where slug='reader-selection'),0::bigint,'catalog category filter excludes nonmatches');
select is((select count(*) from public.list_published_resources('fr',null)),0::bigint,'unsupported reader locale returns no rows');
select is((select count(*) from public.get_published_resource('unknown-resource','en')),0::bigint,'unknown slug is safely absent');
select ok(not ((select to_jsonb(r) from public.get_published_resource('reader-selection','am') r) ?| array['id','review_status','review_note','submitted_by','submitted_at','reviewed_by','reviewed_at','created_by','updated_by','published_by','archived_by','version','source_translation_version','audits','household_id','dependent_id','document_id','reminder_id']),'detail payload omits workflow and private identifiers');
select ok(not ((select to_jsonb(r) from public.list_published_resources('en',null) r where slug='reader-selection') ?| array['id','body','review_status','review_note','submitted_by','submitted_at','reviewed_by','reviewed_at','created_by','updated_by','published_by','archived_by','version','source_translation_version','audits','household_id','dependent_id','document_id','reminder_id']),'catalog payload omits body, workflow, and private identifiers');

reset role;
update public.resource_translations set review_status='draft' where resource_id=(select id from public.resources where slug='reader-selection') and locale='am';
set local role anon;
select is((select selected_locale from public.get_published_resource('reader-selection','am')),'en','draft Amharic falls back to English');
select is((select using_english_fallback from public.get_published_resource('reader-selection','am')),true,'draft Amharic reports fallback');
reset role;
update public.resource_translations set review_status='in_review' where resource_id=(select id from public.resources where slug='reader-selection') and locale='am';
set local role anon;
select is((select selected_locale from public.get_published_resource('reader-selection','am')),'en','in-review Amharic falls back to English');
reset role;
update public.resource_translations set review_status='approved',source_translation_version=99 where resource_id=(select id from public.resources where slug='reader-selection') and locale='am';
set local role anon;
select is((select selected_locale from public.get_published_resource('reader-selection','am')),'en','stale Amharic falls back to English');
select is((select title from public.list_published_resources('am',null) where slug='reader-selection'),'Canonical English title','stale Amharic catalog uses English');
reset role;
delete from public.resource_translations where resource_id=(select id from public.resources where slug='reader-selection') and locale='am';
set local role anon;
select is((select selected_locale from public.get_published_resource('reader-selection','am')),'en','missing Amharic falls back to English');
select isnt((select title from public.get_published_resource('reader-selection','am')),'Título en español','Spanish is never an Amharic fallback');
reset role;
update public.resource_translations set review_status='draft' where resource_id=(select id from public.resources where slug='reader-selection') and locale='es';
set local role anon;
select is((select selected_locale from public.get_published_resource('reader-selection','es')),'en','draft Spanish falls back to English');
reset role;
update public.resource_translations set review_status='in_review' where resource_id=(select id from public.resources where slug='reader-selection') and locale='es';
set local role anon;
select is((select selected_locale from public.get_published_resource('reader-selection','es')),'en','in-review Spanish falls back to English');
reset role;
update public.resource_translations set review_status='approved',source_translation_version=99 where resource_id=(select id from public.resources where slug='reader-selection') and locale='es';
set local role anon;
select is((select selected_locale from public.get_published_resource('reader-selection','es')),'en','stale Spanish falls back to English');
select is((select title from public.list_published_resources('es',null) where slug='reader-selection'),'Canonical English title','stale Spanish catalog uses English');
reset role;
delete from public.resource_translations where resource_id=(select id from public.resources where slug='reader-selection') and locale='es';
set local role anon;
select is((select selected_locale from public.get_published_resource('reader-selection','es')),'en','missing Spanish falls back to English');
select isnt((select title from public.get_published_resource('reader-selection','es')),'የአማርኛ ርዕስ','Amharic is never a Spanish fallback');

reset role;
update public.resources set status='draft' where slug='reader-selection';
set local role anon;
select is((select count(*) from public.get_published_resource('reader-selection','en')),0::bigint,'draft parent is not public');
reset role;
update public.resources set status='in_review' where slug='reader-selection';
set local role anon;
select is((select count(*) from public.get_published_resource('reader-selection','en')),0::bigint,'in-review parent is not public');
reset role;
update public.resources set status='archived',archived_at=now() where slug='reader-selection';
set local role anon;
select is((select count(*) from public.get_published_resource('reader-selection','en')),0::bigint,'archived parent is not public');
reset role;
update public.resources set status='published',archived_at=null where slug='reader-selection';
update public.resource_translations set review_status='draft' where resource_id=(select id from public.resources where slug='reader-selection') and locale='en';
set local role anon;
select is((select count(*) from public.get_published_resource('reader-selection','am')),0::bigint,'unapproved English prevents fallback');
reset role;
delete from public.resource_translations where resource_id=(select id from public.resources where slug='reader-selection') and locale='en';
set local role anon;
select is((select count(*) from public.get_published_resource('reader-selection','en')),0::bigint,'missing canonical English prevents a public detail');
select is((select count(*) from public.list_published_resources('am',null) where slug='reader-selection'),0::bigint,'missing canonical English prevents catalog fallback');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.create_resource_draft('source-invalidation','education','Original English title','The original English summary is sufficiently long for validation.','The original English body is deliberately long enough to validate source invalidation behavior safely.','45000000-0000-4000-8000-000000000002')$$,'source invalidation fixture is created');
reset role;
update public.resource_translations set review_status='approved',reviewed_by='25000000-0000-0000-0000-000000000001',reviewed_at=now() where resource_id=(select id from public.resources where slug='source-invalidation') and locale='en';
insert into public.resource_translations(resource_id,locale,title,summary,body,review_status,source_translation_version,created_by,updated_by,submitted_by,submitted_at,reviewed_by,reviewed_at,review_note)
values
  ((select id from public.resources where slug='source-invalidation'),'am','የተከማቸ ርዕስ','ይህ የተከማቸ የአማርኛ ማጠቃለያ በቂ ርዝመት አለው።','ይህ የተከማቸ የአማርኛ አካል በቂ ርዝመት ያለው ሲሆን ከምንጭ ለውጥ በኋላ መቆየት አለበት። ተጨማሪ የሙከራ ይዘት እዚህ ተቀምጧል።','approved',1,'25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001',now(),'25000000-0000-0000-0000-000000000001',now(),'Prior review note'),
  ((select id from public.resources where slug='source-invalidation'),'es','Título almacenado','Este resumen almacenado en español tiene longitud suficiente.','Este cuerpo almacenado en español tiene longitud suficiente y debe conservarse después del cambio de fuente.','in_review',1,'25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001',now(),null,null,null);
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.update_resource_draft((select id from public.resources where slug='source-invalidation'),1,'source-invalidation','education','Changed English title','The original English summary is sufficiently long for validation.','The original English body is deliberately long enough to validate source invalidation behavior safely.')$$,'title-only change succeeds atomically');
reset role;
select is((select version from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale='en'),2,'title change increments English version');
select is((select summary from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale='en'),'The original English summary is sufficiently long for validation.','title change preserves English summary');
select is((select body from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale='en'),'The original English body is deliberately long enough to validate source invalidation behavior safely.','title change preserves English body');
select is((select title from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale='am'),'የተከማቸ ርዕስ','title change preserves Amharic content');
select is((select title from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale='es'),'Título almacenado','title change preserves Spanish content');
select is((select count(*) from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale in ('am','es') and review_status='draft'),2::bigint,'approved and in-review translations reset to draft');
select is((select count(*) from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale in ('am','es') and (submitted_by is not null or submitted_at is not null or reviewed_by is not null or reviewed_at is not null or review_note is not null)),0::bigint,'source change clears active review fields');
select is((select count(*) from public.resource_translation_audit_events where resource_id=(select id from public.resources where slug='source-invalidation') and action='source_changed'),2::bigint,'title change creates one source-change audit per translation');
select is((select count(*) from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale in ('am','es') and source_translation_version=1),2::bigint,'title change retains prior source versions and makes translations stale');
select ok((select bool_and(not (safe_metadata ? 'body')) from public.resource_translation_audit_events where resource_id=(select id from public.resources where slug='source-invalidation') and action='source_changed'),'source-change audits contain no body content');

update public.resource_translations set review_status=case locale when 'am' then 'approved' else 'draft' end,source_translation_version=2 where resource_id=(select id from public.resources where slug='source-invalidation') and locale in ('am','es');
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.update_resource_draft((select id from public.resources where slug='source-invalidation'),2,'source-invalidation','education','Changed English title','A changed English summary that is sufficiently long for validation.','The original English body is deliberately long enough to validate source invalidation behavior safely.')$$,'summary-only change succeeds atomically');
reset role;
select is((select version from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale='en'),3,'summary change increments English version');
select is((select review_status from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale='am'),'draft','summary change resets approved Amharic');
select is((select review_status from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale='es'),'draft','summary change keeps draft Spanish draft');
select is((select count(*) from public.resource_translation_audit_events where resource_id=(select id from public.resources where slug='source-invalidation') and action='source_changed'),4::bigint,'summary change adds exactly one audit per existing translation');

update public.resource_translations set review_status=case locale when 'am' then 'draft' else 'approved' end,source_translation_version=3 where resource_id=(select id from public.resources where slug='source-invalidation') and locale in ('am','es');
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.update_resource_draft((select id from public.resources where slug='source-invalidation'),3,'source-invalidation','education','Changed English title','A changed English summary that is sufficiently long for validation.','A changed English body is deliberately long enough to validate body-only source invalidation behavior safely.')$$,'body-only change succeeds atomically');
select lives_ok($$select * from public.submit_resource_for_review((select id from public.resources where slug='source-invalidation'),4)$$,'changed English source submits');
select lives_ok($$select * from public.approve_resource((select id from public.resources where slug='source-invalidation'),5)$$,'changed English source approves');
select lives_ok($$select * from public.publish_resource((select id from public.resources where slug='source-invalidation'),6)$$,'changed English source republishes');
reset role;
select is((select version from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale='en'),4,'body change increments English version once and workflow does not');
select is((select review_status from public.resource_translations where resource_id=(select id from public.resources where slug='source-invalidation') and locale='es'),'draft','body change resets approved Spanish');
select is((select count(*) from public.resource_translation_audit_events where resource_id=(select id from public.resources where slug='source-invalidation') and action='source_changed'),6::bigint,'body change adds exactly one audit per existing translation');
set local role anon;
select is((select selected_locale from public.get_published_resource('source-invalidation','am')),'en','stale Amharic falls back after republishing changed English');
select is((select selected_locale from public.get_published_resource('source-invalidation','es')),'en','stale Spanish falls back after republishing changed English');
select is((select selected_locale from public.get_published_resource('source-invalidation','en')),'en','changed English remains publicly available');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.create_resource_draft('noninvalidating-update','general','Stable English title','A stable English summary that is sufficiently long for validation.','A stable English body is deliberately long enough to validate non-invalidating updates safely.','45000000-0000-4000-8000-000000000003')$$,'non-invalidating fixture is created');
reset role;
insert into public.resource_translations(resource_id,locale,title,summary,body,review_status,source_translation_version,created_by,updated_by)
values
  ((select id from public.resources where slug='noninvalidating-update'),'am','የተረጋጋ ርዕስ','ይህ የተረጋጋ የአማርኛ ማጠቃለያ በቂ ርዝመት አለው።','ይህ የተረጋጋ የአማርኛ አካል በቂ ርዝመት ያለው ሲሆን በሌሎች ለውጦች ላይ መቆየት አለበት። ተጨማሪ የሙከራ ይዘት እዚህ ተቀምጧል።','approved',1,'25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001'),
  ((select id from public.resources where slug='noninvalidating-update'),'es','Título estable','Este resumen estable en español tiene longitud suficiente.','Este cuerpo estable en español tiene longitud suficiente y debe conservarse durante cambios no invalidantes.','approved',1,'25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.update_resource_draft((select id from public.resources where slug='noninvalidating-update'),1,'noninvalidating-update','education','Stable English title','A stable English summary that is sufficiently long for validation.','A stable English body is deliberately long enough to validate non-invalidating updates safely.')$$,'category-only update succeeds');
select lives_ok($$select * from public.update_resource_draft((select id from public.resources where slug='noninvalidating-update'),2,'renamed-noninvalidating-update','education','Stable English title','A stable English summary that is sufficiently long for validation.','A stable English body is deliberately long enough to validate non-invalidating updates safely.')$$,'allowed slug-only update succeeds');
reset role;
select is((select version from public.resource_translations where resource_id=(select id from public.resources where slug='renamed-noninvalidating-update') and locale='en'),1,'category and slug updates do not increment English version');
select is((select count(*) from public.resource_translations where resource_id=(select id from public.resources where slug='renamed-noninvalidating-update') and locale in ('am','es') and review_status='approved' and source_translation_version=1),2::bigint,'category and slug updates preserve translation state and source versions');
select is((select count(*) from public.resource_translation_audit_events where resource_id=(select id from public.resources where slug='renamed-noninvalidating-update') and action='source_changed'),0::bigint,'category and slug updates create no source-change audits');

set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.submit_resource_for_review((select id from public.resources where slug='renamed-noninvalidating-update'),3)$$,'workflow-only submit succeeds');
select lives_ok($$select * from public.approve_resource((select id from public.resources where slug='renamed-noninvalidating-update'),4)$$,'workflow-only approve succeeds');
select lives_ok($$select * from public.publish_resource((select id from public.resources where slug='renamed-noninvalidating-update'),5)$$,'workflow-only publish succeeds');
select lives_ok($$select * from public.unpublish_resource((select id from public.resources where slug='renamed-noninvalidating-update'),6)$$,'workflow-only unpublish succeeds');
select lives_ok($$select * from public.archive_resource((select id from public.resources where slug='renamed-noninvalidating-update'),7)$$,'workflow-only archive succeeds');
select lives_ok($$select * from public.restore_resource((select id from public.resources where slug='renamed-noninvalidating-update'),8)$$,'workflow-only restore succeeds');
reset role;
select is((select version from public.resource_translations where resource_id=(select id from public.resources where slug='renamed-noninvalidating-update') and locale='en'),1,'workflow-only transitions do not increment English content version');
select is((select count(*) from public.resource_translations where resource_id=(select id from public.resources where slug='renamed-noninvalidating-update') and locale in ('am','es') and review_status='approved' and source_translation_version=1),2::bigint,'workflow-only transitions preserve translation review and source versions');
select is((select count(*) from public.resource_translation_audit_events where resource_id=(select id from public.resources where slug='renamed-noninvalidating-update') and action='source_changed'),0::bigint,'workflow-only transitions create no source-change audits');
select is((select count(*) from public.resource_translations where resource_id=(select id from public.resources where slug='renamed-noninvalidating-update') and locale not in ('en','am','es')),0::bigint,'non-invalidating updates create no translation slug or unsupported locale row');

set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.create_resource_draft('spanish-only-invalidation','education','Spanish-only source','A canonical summary long enough for Spanish-only invalidation.','A canonical body deliberately long enough for Spanish-only invalidation regression coverage.','45000000-0000-4000-8000-000000000004')$$,'Spanish-only invalidation fixture is created');
reset role;
insert into public.resource_translations(resource_id,locale,title,summary,body,review_status,source_translation_version,created_by,updated_by)
values ((select id from public.resources where slug='spanish-only-invalidation'),'es','Traducción existente','Este resumen existente en español tiene longitud suficiente.','Este cuerpo existente en español tiene longitud suficiente y debe conservarse durante la invalidación.','approved',1,'25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.update_resource_draft((select id from public.resources where slug='spanish-only-invalidation'),1,'spanish-only-invalidation','education','Changed Spanish-only source','A canonical summary long enough for Spanish-only invalidation.','A canonical body deliberately long enough for Spanish-only invalidation regression coverage.')$$,'source change with missing Amharic succeeds');
reset role;
select is((select count(*) from public.resource_translation_audit_events where resource_id=(select id from public.resources where slug='spanish-only-invalidation') and action='source_changed'),1::bigint,'only existing Spanish receives a source-change audit');
select is((select count(*) from public.resource_translations where resource_id=(select id from public.resources where slug='spanish-only-invalidation') and locale='am'),0::bigint,'missing Amharic is not created by invalidation');
select is((select title from public.resource_translations where resource_id=(select id from public.resources where slug='spanish-only-invalidation') and locale='es'),'Traducción existente','existing Spanish content remains stored');

set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.create_resource_draft('amharic-only-invalidation','education','Amharic-only source','A canonical summary long enough for Amharic-only invalidation.','A canonical body deliberately long enough for Amharic-only invalidation regression coverage.','45000000-0000-4000-8000-000000000005')$$,'Amharic-only invalidation fixture is created');
reset role;
insert into public.resource_translations(resource_id,locale,title,summary,body,review_status,source_translation_version,created_by,updated_by)
values ((select id from public.resources where slug='amharic-only-invalidation'),'am','ያለ ትርጉም ርዕስ','ይህ ያለው የአማርኛ ማጠቃለያ በቂ ርዝመት አለው።','ይህ ያለው የአማርኛ አካል በቂ ርዝመት ያለው ሲሆን በምንጭ ለውጥ ጊዜ መቆየት አለበት። ተጨማሪ ይዘት።','approved',1,'25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.update_resource_draft((select id from public.resources where slug='amharic-only-invalidation'),1,'amharic-only-invalidation','education','Changed Amharic-only source','A canonical summary long enough for Amharic-only invalidation.','A canonical body deliberately long enough for Amharic-only invalidation regression coverage.')$$,'source change with missing Spanish succeeds');
reset role;
select is((select count(*) from public.resource_translation_audit_events where resource_id=(select id from public.resources where slug='amharic-only-invalidation') and action='source_changed'),1::bigint,'only existing Amharic receives a source-change audit');
select is((select count(*) from public.resource_translations where resource_id=(select id from public.resources where slug='amharic-only-invalidation') and locale='es'),0::bigint,'missing Spanish is not created by invalidation');

set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-0000-0000-000000000001';
select lives_ok($$select * from public.create_resource_draft('no-translation-invalidation','education','No-translation source','A canonical summary long enough for no-translation invalidation.','A canonical body deliberately long enough for no-translation invalidation regression coverage.','45000000-0000-4000-8000-000000000006')$$,'no-translation invalidation fixture is created');
select lives_ok($$select * from public.update_resource_draft((select id from public.resources where slug='no-translation-invalidation'),1,'no-translation-invalidation','education','Changed no-translation source','A canonical summary long enough for no-translation invalidation.','A canonical body deliberately long enough for no-translation invalidation regression coverage.')$$,'source change with both translations missing succeeds');
reset role;
select is((select count(*) from public.resource_translation_audit_events where resource_id=(select id from public.resources where slug='no-translation-invalidation') and action='source_changed'),0::bigint,'no audits are created when both translations are missing');
select is((select count(*) from public.resource_translations where resource_id=(select id from public.resources where slug='no-translation-invalidation')),1::bigint,'missing translations are not created by invalidation');

select * from finish();
rollback;
