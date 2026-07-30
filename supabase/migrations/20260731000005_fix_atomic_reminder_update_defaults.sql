-- Keep the atomic roadmap update contract aligned with update_roadmap_item:
-- optional roadmap fields must remain omittable through PostgREST RPC calls.
create or replace function public.update_roadmap_item_and_reschedule_reminders(
  target_item_id uuid,
  expected_updated_at timestamptz,
  input_title text,
  input_description text default null,
  input_category text default null,
  input_priority text default null,
  input_status text default null,
  input_due_date date default null,
  input_dependent_id uuid default null,
  input_assigned_to uuid default null,
  input_reminder_schedules jsonb default '[]'::jsonb
) returns table(id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare schedule jsonb; reminder public.reminders%rowtype; updated_item record; item_title text;
begin
  if jsonb_typeof(input_reminder_schedules) <> 'array' then raise exception 'Reminder schedules are invalid.' using errcode='22023'; end if;
  select * into updated_item from public.update_roadmap_item(target_item_id, expected_updated_at, input_title, input_description, input_category, input_priority, input_status, input_due_date, input_dependent_id, input_assigned_to);
  for reminder in select candidate.* from public.reminders as candidate where candidate.roadmap_item_id=target_item_id and candidate.status='scheduled' for update loop
    select value into schedule from jsonb_array_elements(input_reminder_schedules) where value->>'id'=reminder.id::text;
    if schedule is null or coalesce((schedule->>'expectedScheduleVersion')::integer,0) <> reminder.schedule_version then raise exception 'Reminder schedule is stale.' using errcode='40001'; end if;
    select item.title into item_title from public.roadmap_items as item where item.id=target_item_id;
    if schedule->>'kind'='cancelled' then
      update public.reminders as candidate set status='cancelled',cancelled_at=now(),cancellation_reason='roadmap_due_date_moved_to_past',next_attempt_at=null,locked_at=null,locked_by=null where candidate.id=reminder.id;
      insert into public.reminder_delivery_logs(reminder_id,household_id,recipient_user_id,roadmap_item_id,attempt_number,status,scheduled_for_utc,completed_at,safe_error_code,roadmap_title_snapshot) values(reminder.id,reminder.household_id,reminder.user_id,target_item_id,greatest(reminder.attempt_count,1),'cancelled',reminder.scheduled_for_utc,now(),'roadmap_due_date_moved_to_past',item_title);
    elsif schedule->>'kind'='rescheduled' then
      update public.reminders as candidate set scheduled_local_date=(schedule->>'scheduledLocalDate')::date,scheduled_for_utc=(schedule->>'scheduledForUtc')::timestamptz,timezone_offset_minutes=(schedule->>'timezoneOffsetMinutes')::integer,schedule_version=candidate.schedule_version+1,attempt_count=0,next_attempt_at=(schedule->>'scheduledForUtc')::timestamptz,locked_at=null,locked_by=null where candidate.id=reminder.id;
      insert into public.reminder_delivery_logs(reminder_id,household_id,recipient_user_id,roadmap_item_id,attempt_number,status,scheduled_for_utc,completed_at,safe_error_code,roadmap_title_snapshot) values(reminder.id,reminder.household_id,reminder.user_id,target_item_id,greatest(reminder.attempt_count,1),'rescheduled',(schedule->>'scheduledForUtc')::timestamptz,now(),null,item_title);
    else raise exception 'Reminder schedules are invalid.' using errcode='22023'; end if;
  end loop;
  return query select updated_item.id,updated_item.updated_at;
end; $$;

revoke all on function public.update_roadmap_item_and_reschedule_reminders(uuid,timestamptz,text,text,text,text,text,date,uuid,uuid,jsonb) from public,anon;
grant execute on function public.update_roadmap_item_and_reschedule_reminders(uuid,timestamptz,text,text,text,text,text,date,uuid,uuid,jsonb) to authenticated;
