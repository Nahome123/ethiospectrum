begin;
select plan(18);

select has_table('public', 'reminders', 'reminders table exists');
select has_table('public', 'reminder_delivery_logs', 'delivery-log table exists');
select has_column('public', 'reminders', 'schedule_version', 'schedule version is stored');
select has_column('public', 'reminders', 'seen_at', 'seen state is stored');
select has_column('public', 'reminders', 'scheduled_for_utc', 'authoritative UTC schedule is stored');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.reminders'::regclass), 'reminder RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.reminder_delivery_logs'::regclass), 'delivery-log RLS is enabled and forced');
select has_function('public', 'create_personal_reminder', 'controlled create function exists');
select has_function('public', 'update_personal_reminder', 'controlled edit function exists');
select has_function('public', 'update_roadmap_item_and_reschedule_reminders', 'atomic reschedule function exists');
select has_function('public', 'claim_due_reminders', 'worker claim function exists');
select has_function('public', 'complete_reminder_delivery', 'worker completion function exists');
select has_function('public', 'fail_reminder_delivery', 'worker retry function exists');
select has_function('public', 'skip_reminder_delivery', 'worker skip function exists');
select ok(position('search_path' in pg_get_functiondef('public.update_personal_reminder(uuid,integer,integer,time,text,date,timestamptz,integer)'::regprocedure)) > 0, 'edit function fixes search path');
select ok(position('search_path' in pg_get_functiondef('public.update_roadmap_item_and_reschedule_reminders(uuid,timestamptz,text,text,text,text,text,date,uuid,uuid,jsonb)'::regprocedure)) > 0, 'atomic reschedule function fixes search path');
select ok(not has_function_privilege('anon', 'public.claim_due_reminders(text,integer)', 'execute'), 'anonymous callers cannot claim reminders');
select ok(not has_function_privilege('authenticated', 'public.claim_due_reminders(text,integer)', 'execute'), 'ordinary users cannot claim reminders');

select * from finish();
rollback;
