begin;

select no_plan();

create temporary table course_ref on commit drop as
select id from public.training_courses where slug = 'rbt-boot-camp';

select is(
  (select count(*) from public.training_modules where course_id = (select id from course_ref)
     and title in ('ABA therapy at home', 'IEP and 504 accommodations')),
  2::bigint, 'the ABA and IEP/504 modules are added to RBT Boot Camp');

select is(
  (select count(*) from public.training_lessons as lesson
   join public.training_modules as module on module.id = lesson.module_id
   where module.course_id = (select id from course_ref) and module.title = 'Understanding neurodivergency'),
  4::bigint, 'the autism awareness lessons are added to Understanding neurodivergency');

select is(
  (select count(*) from public.training_lessons as lesson
   join public.training_modules as module on module.id = lesson.module_id
   where module.title = 'ABA therapy at home'),
  5::bigint, 'the ABA at home module has five lessons');

select is(
  (select count(*) from public.training_lessons as lesson
   join public.training_modules as module on module.id = lesson.module_id
   where module.title = 'IEP and 504 accommodations'),
  8::bigint, 'the IEP and 504 module has eight lessons');

select is(
  (select count(*) from public.training_lessons as lesson
   join public.training_modules as module on module.id = lesson.module_id
   where module.title in ('ABA therapy at home', 'IEP and 504 accommodations', 'Understanding neurodivergency')
     and (lesson.body is null or lesson.localized -> 'am' ->> 'body' is null or lesson.localized -> 'am' ->> 'title' is null)),
  0::bigint, 'every new lesson has English text and an Amharic title and text');

select is(
  (select count(*) from public.training_lessons as lesson
   join public.training_modules as module on module.id = lesson.module_id
   where module.title in ('ABA therapy at home', 'IEP and 504 accommodations') and lesson.status <> 'draft'),
  0::bigint, 'new lessons start as drafts for review');

select ok(
  (select body like '%Provide a visual timer%' and localized -> 'am' ->> 'body' like '%የእይታ ሰዓት ቆጣሪ ያቅርቡ%'
   from public.training_lessons where title = 'Math and time'),
  'accommodations are copied in English and Amharic');

select * from finish();
rollback;
