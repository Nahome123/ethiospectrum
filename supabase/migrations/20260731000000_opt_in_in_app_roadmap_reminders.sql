-- ETH-022: corrective personal in-app roadmap reminders. No external delivery.
alter table public.reminders
  add column if not exists household_id uuid references public.households(id) on delete cascade,
  add column if not exists offset_days integer,
  add column if not exists scheduled_local_date date,
  add column if not exists scheduled_local_time time,
  add column if not exists timezone text,
  add column if not exists timezone_offset_minutes integer,
  add column if not exists scheduled_for_utc timestamptz,
  add column if not exists schedule_version integer not null default 1,
  add column if not exists consented_at timestamptz,
  add column if not exists consent_version text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists delivered_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists idempotency_key uuid,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists seen_at timestamptz;

alter table public.reminders
  alter column channel set default 'in_app',
  alter column status set default 'scheduled',
  alter column remind_at drop not null;

update public.reminders as reminder
set household_id = item.household_id
from public.roadmap_items as item
where item.id = reminder.roadmap_item_id and reminder.household_id is null;

-- The pre-ETH-022 reminder table was never used as a delivery queue.  Keep
-- any legacy rows auditable, but make them inert before the stricter lifecycle
-- constraints below are installed.
update public.reminders as reminder
set
  channel = 'in_app',
  status = case
    when reminder.status in ('pending', 'processing') then 'cancelled'
    when reminder.status = 'sent' then 'delivered'
    when reminder.status in ('cancelled', 'failed') then reminder.status
    else 'cancelled'
  end,
  offset_days = coalesce(reminder.offset_days, 0),
  scheduled_local_date = coalesce(reminder.scheduled_local_date, reminder.remind_at::date),
  scheduled_local_time = coalesce(reminder.scheduled_local_time, reminder.remind_at::time),
  timezone = coalesce(reminder.timezone, 'Etc/UTC'),
  timezone_offset_minutes = coalesce(reminder.timezone_offset_minutes, 0),
  scheduled_for_utc = coalesce(reminder.scheduled_for_utc, reminder.remind_at),
  cancelled_at = case when reminder.status in ('pending', 'processing') then coalesce(reminder.cancelled_at, now()) else reminder.cancelled_at end,
  cancellation_reason = case when reminder.status in ('pending', 'processing') then coalesce(reminder.cancellation_reason, 'legacy_reminder_retired') else reminder.cancellation_reason end
where reminder.offset_days is null
  or reminder.scheduled_for_utc is null
  or reminder.status in ('pending', 'sent');

alter table public.reminders
  alter column household_id set not null,
  drop constraint if exists reminders_channel_check,
  drop constraint if exists reminders_status_check,
  add constraint reminders_channel_check check (channel = 'in_app'),
  add constraint reminders_status_check check (status in ('scheduled','processing','delivered','failed','cancelled','skipped')),
  add constraint reminders_offset_check check (offset_days in (0,1,3,7)),
  add constraint reminders_attempt_check check (attempt_count between 0 and 3),
  add constraint reminders_schedule_check check (
    (status = 'scheduled' and consented_at is not null and consent_version is not null and scheduled_for_utc is not null)
    or status <> 'scheduled'
  );

create unique index if not exists reminders_active_schedule_unique
  on public.reminders (roadmap_item_id, user_id, offset_days, scheduled_local_time, timezone)
  where status in ('scheduled','processing');
create unique index if not exists reminders_idempotency_unique
  on public.reminders (user_id, idempotency_key) where idempotency_key is not null;
create index if not exists reminders_due_claim_idx on public.reminders (next_attempt_at, scheduled_for_utc)
  where status in ('scheduled','processing');

create table if not exists public.reminder_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  roadmap_item_id uuid not null references public.roadmap_items(id) on delete cascade,
  attempt_number integer not null check (attempt_number between 1 and 3),
  status text not null check (status in ('delivered','failed','skipped','rescheduled','cancelled')),
  scheduled_for_utc timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  worker_run_id text,
  safe_error_code text,
  roadmap_title_snapshot text not null check (char_length(roadmap_title_snapshot) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (reminder_id, attempt_number, status)
);
create unique index if not exists reminder_delivery_logs_one_success_idx
  on public.reminder_delivery_logs (reminder_id) where status = 'delivered';

alter table public.reminders enable row level security;
alter table public.reminders force row level security;
alter table public.reminder_delivery_logs enable row level security;
alter table public.reminder_delivery_logs force row level security;
drop policy if exists reminders_access on public.reminders;
create policy reminders_recipient_read on public.reminders for select to authenticated
  using (user_id = auth.uid() and private.is_active_household_member(household_id));
create policy reminder_logs_recipient_read on public.reminder_delivery_logs for select to authenticated
  using (recipient_user_id = auth.uid() and private.is_active_household_member(household_id));
revoke all on public.reminders, public.reminder_delivery_logs from anon, authenticated;
grant select on public.reminders, public.reminder_delivery_logs to authenticated;

create or replace function private.reminder_cancel_for_roadmap_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare reason text;
begin
  reason := case when new.archived_at is not null then 'roadmap_archived'
    when new.status = 'completed' then 'roadmap_completed'
    when new.status = 'cancelled' then 'roadmap_cancelled' end;
  if reason is not null then
    update public.reminders set status='cancelled', cancelled_at=now(), cancellation_reason=reason
    where roadmap_item_id=new.id and status='scheduled';
  end if;
  return new;
end; $$;
drop trigger if exists roadmap_reminder_lifecycle on public.roadmap_items;
create trigger roadmap_reminder_lifecycle after update of due_date,status,archived_at on public.roadmap_items
for each row execute function private.reminder_cancel_for_roadmap_change();

create or replace function public.create_personal_reminder(
  target_roadmap_item_id uuid, input_offset_days integer, input_local_time time,
  input_timezone text, input_scheduled_local_date date, input_scheduled_for_utc timestamptz,
  input_timezone_offset_minutes integer, input_idempotency_key uuid
) returns table(id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare item public.roadmap_items%rowtype; actor_id uuid := auth.uid(); existing public.reminders%rowtype;
begin
  select * into item from public.roadmap_items as roadmap_item where roadmap_item.id=target_roadmap_item_id;
  if not found or not private.is_active_household_member(item.household_id)
    or item.archived_at is not null or item.due_date is null or item.status in ('completed','cancelled') then
    raise exception 'Reminder item is unavailable.' using errcode='42501';
  end if;
  if input_offset_days not in (0,1,3,7) or input_timezone !~ '^[A-Za-z_]+/[A-Za-z_]+(?:/[A-Za-z_]+)?$' then
    raise exception 'Reminder schedule is invalid.' using errcode='22023'; end if;
  if input_scheduled_local_date <> item.due_date - input_offset_days or input_scheduled_for_utc <= now() + interval '5 minutes' then
    raise exception 'Reminder schedule is unavailable.' using errcode='22023'; end if;
  select * into existing from public.reminders as prior_reminder where prior_reminder.user_id=actor_id and prior_reminder.idempotency_key=input_idempotency_key;
  if found then return query select existing.id, existing.updated_at; return; end if;
  if (select count(*) from public.reminders where roadmap_item_id=item.id and user_id=actor_id and status in ('scheduled','processing')) >= 5 then
    raise exception 'Reminder limit reached.' using errcode='22023'; end if;
  insert into public.reminders(household_id,roadmap_item_id,user_id,channel,status,offset_days,scheduled_local_date,scheduled_local_time,timezone,timezone_offset_minutes,scheduled_for_utc,next_attempt_at,consented_at,consent_version,idempotency_key)
  values(item.household_id,item.id,actor_id,'in_app','scheduled',input_offset_days,input_scheduled_local_date,input_local_time,input_timezone,input_timezone_offset_minutes,input_scheduled_for_utc,input_scheduled_for_utc,now(),'2026-07-30',input_idempotency_key)
  returning reminders.id, reminders.updated_at into id, updated_at; return next;
end; $$;

create or replace function public.cancel_personal_reminder(target_reminder_id uuid, expected_updated_at timestamptz)
returns table(id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare reminder public.reminders%rowtype;
begin
  select * into reminder from public.reminders where reminders.id=target_reminder_id for update;
  if not found or reminder.user_id <> auth.uid() or not private.is_active_household_member(reminder.household_id) then raise exception 'Reminder is unavailable.' using errcode='42501'; end if;
  if reminder.status='cancelled' then return query select reminder.id, reminder.updated_at; return; end if;
  if reminder.status <> 'scheduled' then raise exception 'Reminder cannot be cancelled.' using errcode='22023'; end if;
  if reminder.updated_at is distinct from expected_updated_at then raise exception 'Reminder is stale.' using errcode='40001'; end if;
  update public.reminders set status='cancelled', cancelled_at=now(), cancellation_reason='recipient_cancelled', consented_at=null where reminders.id=reminder.id returning reminders.id, reminders.updated_at into id,updated_at;
  insert into public.reminder_delivery_logs(reminder_id,household_id,recipient_user_id,roadmap_item_id,attempt_number,status,scheduled_for_utc,completed_at,roadmap_title_snapshot)
  select reminder.id,reminder.household_id,reminder.user_id,reminder.roadmap_item_id, greatest(reminder.attempt_count,1),'cancelled',reminder.scheduled_for_utc,now(),item.title from public.roadmap_items item where item.id=reminder.roadmap_item_id;
  return next;
end; $$;

create or replace function public.mark_reminder_seen(target_reminder_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.reminders as reminder set seen_at=coalesce(reminder.seen_at,now()) where reminder.id=target_reminder_id and reminder.user_id=auth.uid() and reminder.status='delivered' and private.is_active_household_member(reminder.household_id);
  return found;
end; $$;

revoke all on function public.create_personal_reminder(uuid,integer,time,text,date,timestamptz,integer,uuid) from public,anon;
revoke all on function public.cancel_personal_reminder(uuid,timestamptz) from public,anon;
revoke all on function public.mark_reminder_seen(uuid) from public,anon;
grant execute on function public.create_personal_reminder(uuid,integer,time,text,date,timestamptz,integer,uuid) to authenticated;
grant execute on function public.cancel_personal_reminder(uuid,timestamptz) to authenticated;
grant execute on function public.mark_reminder_seen(uuid) to authenticated;

create or replace function public.claim_due_reminders(worker_run_id text, requested_limit integer default 50)
returns table(reminder_id uuid, roadmap_item_id uuid, recipient_user_id uuid, attempt_number integer)
language plpgsql security definer set search_path = '' as $$
declare claimed public.reminders%rowtype; limit_count integer := least(greatest(coalesce(requested_limit,1),1),50);
begin
  if current_user::text <> 'service_role' then raise exception 'Worker access is unavailable.' using errcode='42501'; end if;
  for claimed in
    select reminder.* from public.reminders as reminder
    join public.roadmap_items as item on item.id=reminder.roadmap_item_id
    where (reminder.status='scheduled' and coalesce(reminder.next_attempt_at,reminder.scheduled_for_utc)<=now())
      or (reminder.status='processing' and reminder.locked_at < now()-interval '10 minutes' and reminder.attempt_count<3)
    order by coalesce(reminder.next_attempt_at,reminder.scheduled_for_utc), reminder.id
    for update of reminder skip locked limit limit_count
  loop
    update public.reminders as reminder set status='processing', locked_at=now(), locked_by=worker_run_id, attempt_count=reminder.attempt_count+1
    where reminder.id=claimed.id
    returning reminder.id,reminder.roadmap_item_id,reminder.user_id,reminder.attempt_count into reminder_id,roadmap_item_id,recipient_user_id,attempt_number;
    return next;
  end loop;
end; $$;

create or replace function public.complete_reminder_delivery(target_reminder_id uuid, worker_run_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare reminder public.reminders%rowtype; item public.roadmap_items%rowtype;
begin
  if current_user::text <> 'service_role' then raise exception 'Worker access is unavailable.' using errcode='42501'; end if;
  select * into reminder from public.reminders where id=target_reminder_id for update;
  if not found or reminder.status <> 'processing' or reminder.locked_by <> worker_run_id then return false; end if;
  select * into item from public.roadmap_items where id=reminder.roadmap_item_id;
  if not found or item.archived_at is not null or item.status in ('completed','cancelled') or not private.is_active_household_member(reminder.household_id) then return false; end if;
  insert into public.reminder_delivery_logs(reminder_id,household_id,recipient_user_id,roadmap_item_id,attempt_number,status,scheduled_for_utc,started_at,completed_at,worker_run_id,roadmap_title_snapshot)
  values(reminder.id,reminder.household_id,reminder.user_id,reminder.roadmap_item_id,reminder.attempt_count,'delivered',reminder.scheduled_for_utc,reminder.locked_at,now(),worker_run_id,item.title);
  update public.reminders set status='delivered',delivered_at=now(),locked_at=null,locked_by=null,next_attempt_at=null where id=reminder.id;
  return true;
end; $$;

revoke all on function public.claim_due_reminders(text,integer), public.complete_reminder_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_due_reminders(text,integer), public.complete_reminder_delivery(uuid,text) to service_role;

create or replace function public.fail_reminder_delivery(target_reminder_id uuid, worker_run_id text, safe_error_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare reminder public.reminders%rowtype; item_title text; final_status text;
begin
  if current_user::text <> 'service_role' or safe_error_code not in ('delivery_storage_failed','delivery_consistency_failed') then raise exception 'Worker access is unavailable.' using errcode='42501'; end if;
  select * into reminder from public.reminders where id=target_reminder_id for update;
  if not found or reminder.status <> 'processing' or reminder.locked_by <> worker_run_id then return 'ignored'; end if;
  select title into item_title from public.roadmap_items where id=reminder.roadmap_item_id;
  final_status := case when reminder.attempt_count >= 3 then 'failed' else 'scheduled' end;
  insert into public.reminder_delivery_logs(reminder_id,household_id,recipient_user_id,roadmap_item_id,attempt_number,status,scheduled_for_utc,started_at,completed_at,worker_run_id,safe_error_code,roadmap_title_snapshot)
  values(reminder.id,reminder.household_id,reminder.user_id,reminder.roadmap_item_id,reminder.attempt_count,'failed',reminder.scheduled_for_utc,reminder.locked_at,now(),worker_run_id,safe_error_code,coalesce(item_title,'Unavailable roadmap item'));
  update public.reminders set status=final_status, next_attempt_at=case when final_status='scheduled' then now()+case when reminder.attempt_count=1 then interval '5 minutes' else interval '30 minutes' end else null end, locked_at=null,locked_by=null where id=reminder.id;
  return final_status;
end; $$;

create or replace function public.skip_reminder_delivery(target_reminder_id uuid, worker_run_id text, safe_skip_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare reminder public.reminders%rowtype; item_title text;
begin
  if current_user::text <> 'service_role' or safe_skip_code not in ('recipient_inactive','consent_invalid','roadmap_ineligible','relationship_invalid') then raise exception 'Worker access is unavailable.' using errcode='42501'; end if;
  select * into reminder from public.reminders where id=target_reminder_id for update;
  if not found or reminder.status <> 'processing' or reminder.locked_by <> worker_run_id then return false; end if;
  select title into item_title from public.roadmap_items where id=reminder.roadmap_item_id;
  insert into public.reminder_delivery_logs(reminder_id,household_id,recipient_user_id,roadmap_item_id,attempt_number,status,scheduled_for_utc,started_at,completed_at,worker_run_id,safe_error_code,roadmap_title_snapshot)
  values(reminder.id,reminder.household_id,reminder.user_id,reminder.roadmap_item_id,reminder.attempt_count,'skipped',reminder.scheduled_for_utc,reminder.locked_at,now(),worker_run_id,safe_skip_code,coalesce(item_title,'Unavailable roadmap item'));
  update public.reminders set status='skipped',next_attempt_at=null,locked_at=null,locked_by=null where id=reminder.id;
  return true;
end; $$;

revoke all on function public.fail_reminder_delivery(uuid,text,text), public.skip_reminder_delivery(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fail_reminder_delivery(uuid,text,text), public.skip_reminder_delivery(uuid,text,text) to service_role;

-- Keep reminder timestamps coherent for browser optimistic concurrency.
drop trigger if exists reminders_set_updated_at on public.reminders;
create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function private.set_updated_at();

create or replace function private.reminder_recipient_is_active(
  target_household_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as membership
    join public.households as household on household.id = membership.household_id
    where membership.household_id = target_household_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
      and household.deleted_at is null
  );
$$;

create or replace function public.classify_reminder_delivery(
  target_reminder_id uuid,
  worker_run_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder public.reminders%rowtype;
  item public.roadmap_items%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Worker access is unavailable.' using errcode = '42501';
  end if;

  select * into reminder
  from public.reminders as candidate
  where candidate.id = target_reminder_id
  for update;
  if not found or reminder.status <> 'processing' or reminder.locked_by <> worker_run_id then
    return 'ignored';
  end if;
  if reminder.consented_at is null or reminder.consent_version <> '2026-07-30' then
    return 'consent_invalid';
  end if;
  if not private.reminder_recipient_is_active(reminder.household_id, reminder.user_id) then
    return 'recipient_inactive';
  end if;
  select * into item from public.roadmap_items as candidate where candidate.id = reminder.roadmap_item_id;
  if not found
    or item.household_id is distinct from reminder.household_id
    or item.archived_at is not null
    or item.due_date is null
    or item.status in ('completed', 'cancelled') then
    return 'roadmap_ineligible';
  end if;
  if exists (
    select 1 from public.reminder_delivery_logs as delivery_log
    where delivery_log.reminder_id = reminder.id and delivery_log.status = 'delivered'
  ) then
    return 'relationship_invalid';
  end if;
  return 'deliver';
end;
$$;

create or replace function public.claim_due_reminders(worker_run_id text, requested_limit integer default 50)
returns table(reminder_id uuid, roadmap_item_id uuid, recipient_user_id uuid, attempt_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.reminders%rowtype;
  limit_count integer := least(greatest(coalesce(requested_limit, 1), 1), 50);
begin
  if auth.role() <> 'service_role' or nullif(btrim(worker_run_id), '') is null then
    raise exception 'Worker access is unavailable.' using errcode = '42501';
  end if;
  for claimed in
    select reminder.*
    from public.reminders as reminder
    where (
      reminder.status = 'scheduled'
      and reminder.attempt_count < 3
      and coalesce(reminder.next_attempt_at, reminder.scheduled_for_utc) <= now()
    ) or (
      reminder.status = 'processing'
      and reminder.attempt_count < 3
      and reminder.locked_at < now() - interval '10 minutes'
    )
    order by coalesce(reminder.next_attempt_at, reminder.scheduled_for_utc), reminder.id
    for update skip locked
    limit limit_count
  loop
    update public.reminders as reminder
    set
      status = 'processing',
      locked_at = now(),
      locked_by = worker_run_id,
      attempt_count = reminder.attempt_count + 1
    where reminder.id = claimed.id
    returning reminder.id, reminder.roadmap_item_id, reminder.user_id, reminder.attempt_count
      into reminder_id, roadmap_item_id, recipient_user_id, attempt_number;
    return next;
  end loop;
end;
$$;

create or replace function public.complete_reminder_delivery(target_reminder_id uuid, worker_run_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder public.reminders%rowtype;
  item_title text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Worker access is unavailable.' using errcode = '42501';
  end if;
  select * into reminder from public.reminders as candidate where candidate.id = target_reminder_id for update;
  if not found or reminder.status <> 'processing' or reminder.locked_by <> worker_run_id then
    return false;
  end if;
  if public.classify_reminder_delivery(target_reminder_id, worker_run_id) <> 'deliver' then
    return false;
  end if;
  select item.title into item_title from public.roadmap_items as item where item.id = reminder.roadmap_item_id;
  insert into public.reminder_delivery_logs (
    reminder_id, household_id, recipient_user_id, roadmap_item_id, attempt_number, status,
    scheduled_for_utc, started_at, completed_at, worker_run_id, roadmap_title_snapshot
  ) values (
    reminder.id, reminder.household_id, reminder.user_id, reminder.roadmap_item_id,
    reminder.attempt_count, 'delivered', reminder.scheduled_for_utc, reminder.locked_at,
    now(), worker_run_id, item_title
  ) on conflict do nothing;
  if not found then
    return false;
  end if;
  update public.reminders as candidate
  set status = 'delivered', delivered_at = now(), locked_at = null, locked_by = null, next_attempt_at = null
  where candidate.id = reminder.id;
  return true;
end;
$$;

create or replace function public.fail_reminder_delivery(
  target_reminder_id uuid,
  worker_run_id text,
  safe_error_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder public.reminders%rowtype;
  item_title text;
  final_status text;
begin
  if auth.role() <> 'service_role'
    or safe_error_code not in ('delivery_storage_failed', 'delivery_consistency_failed', 'delivery_internal_failed') then
    raise exception 'Worker access is unavailable.' using errcode = '42501';
  end if;
  select * into reminder from public.reminders as candidate where candidate.id = target_reminder_id for update;
  if not found or reminder.status <> 'processing' or reminder.locked_by <> worker_run_id then
    return 'ignored';
  end if;
  select item.title into item_title from public.roadmap_items as item where item.id = reminder.roadmap_item_id;
  final_status := case when reminder.attempt_count >= 3 then 'failed' else 'scheduled' end;
  insert into public.reminder_delivery_logs (
    reminder_id, household_id, recipient_user_id, roadmap_item_id, attempt_number, status,
    scheduled_for_utc, started_at, completed_at, worker_run_id, safe_error_code, roadmap_title_snapshot
  ) values (
    reminder.id, reminder.household_id, reminder.user_id, reminder.roadmap_item_id,
    reminder.attempt_count, 'failed', reminder.scheduled_for_utc, reminder.locked_at, now(),
    worker_run_id, safe_error_code, coalesce(item_title, 'Unavailable roadmap item')
  ) on conflict do nothing;
  update public.reminders as candidate
  set
    status = final_status,
    next_attempt_at = case
      when final_status = 'scheduled' and reminder.attempt_count = 1 then now() + interval '5 minutes'
      when final_status = 'scheduled' then now() + interval '30 minutes'
      else null
    end,
    locked_at = null,
    locked_by = null
  where candidate.id = reminder.id;
  return final_status;
end;
$$;

create or replace function public.skip_reminder_delivery(
  target_reminder_id uuid,
  worker_run_id text,
  safe_skip_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder public.reminders%rowtype;
  item_title text;
begin
  if auth.role() <> 'service_role'
    or safe_skip_code not in ('recipient_inactive', 'consent_invalid', 'roadmap_ineligible', 'relationship_invalid') then
    raise exception 'Worker access is unavailable.' using errcode = '42501';
  end if;
  select * into reminder from public.reminders as candidate where candidate.id = target_reminder_id for update;
  if not found or reminder.status <> 'processing' or reminder.locked_by <> worker_run_id then
    return false;
  end if;
  select item.title into item_title from public.roadmap_items as item where item.id = reminder.roadmap_item_id;
  insert into public.reminder_delivery_logs (
    reminder_id, household_id, recipient_user_id, roadmap_item_id, attempt_number, status,
    scheduled_for_utc, started_at, completed_at, worker_run_id, safe_error_code, roadmap_title_snapshot
  ) values (
    reminder.id, reminder.household_id, reminder.user_id, reminder.roadmap_item_id,
    reminder.attempt_count, 'skipped', reminder.scheduled_for_utc, reminder.locked_at, now(),
    worker_run_id, safe_skip_code, coalesce(item_title, 'Unavailable roadmap item')
  ) on conflict do nothing;
  update public.reminders as candidate
  set status = 'skipped', next_attempt_at = null, locked_at = null, locked_by = null
  where candidate.id = reminder.id;
  return true;
end;
$$;

revoke all on function public.classify_reminder_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_due_reminders(text, integer), public.complete_reminder_delivery(uuid, text), public.fail_reminder_delivery(uuid, text, text), public.skip_reminder_delivery(uuid, text, text) from public, anon, authenticated;
grant execute on function public.classify_reminder_delivery(uuid, text), public.claim_due_reminders(text, integer), public.complete_reminder_delivery(uuid, text), public.fail_reminder_delivery(uuid, text, text), public.skip_reminder_delivery(uuid, text, text) to service_role;

create or replace function public.update_personal_reminder(target_reminder_id uuid, expected_schedule_version integer, input_offset_days integer, input_local_time time, input_timezone text, input_scheduled_local_date date, input_scheduled_for_utc timestamptz, input_timezone_offset_minutes integer)
returns table(id uuid, updated_at timestamptz, schedule_version integer)
language plpgsql security definer set search_path = '' as $$
declare reminder public.reminders%rowtype; item public.roadmap_items%rowtype;
begin
  select * into reminder from public.reminders as candidate where candidate.id = target_reminder_id for update;
  if not found or reminder.user_id <> auth.uid() or reminder.status <> 'scheduled' or not private.is_active_household_member(reminder.household_id) then raise exception 'Reminder is unavailable.' using errcode='42501'; end if;
  if reminder.schedule_version <> expected_schedule_version then raise exception 'Reminder is stale.' using errcode='40001'; end if;
  select * into item from public.roadmap_items as candidate where candidate.id = reminder.roadmap_item_id;
  if not found or item.household_id is distinct from reminder.household_id or item.archived_at is not null or item.due_date is null or item.status in ('completed','cancelled') then raise exception 'Reminder item is unavailable.' using errcode='42501'; end if;
  if input_offset_days not in (0,1,3,7) or input_timezone !~ '^[A-Za-z_]+/[A-Za-z_]+(?:/[A-Za-z_]+)?$' or input_scheduled_local_date <> item.due_date-input_offset_days or input_scheduled_for_utc <= now()+interval '5 minutes' then raise exception 'Reminder schedule is unavailable.' using errcode='22023'; end if;
  if exists (select 1 from public.reminders as other_reminder where other_reminder.roadmap_item_id=reminder.roadmap_item_id and other_reminder.user_id=reminder.user_id and other_reminder.id<>reminder.id and other_reminder.status in ('scheduled','processing') and other_reminder.offset_days=input_offset_days and other_reminder.scheduled_local_time=input_local_time and other_reminder.timezone=input_timezone) then raise exception 'Reminder schedule already exists.' using errcode='23505'; end if;
  update public.reminders as candidate set offset_days=input_offset_days, scheduled_local_date=input_scheduled_local_date, scheduled_local_time=input_local_time, timezone=input_timezone, timezone_offset_minutes=input_timezone_offset_minutes, scheduled_for_utc=input_scheduled_for_utc, next_attempt_at=input_scheduled_for_utc, schedule_version=candidate.schedule_version+1, attempt_count=0, locked_at=null, locked_by=null where candidate.id=reminder.id returning candidate.id,candidate.updated_at,candidate.schedule_version into id,updated_at,schedule_version;
  return next;
end; $$;
revoke all on function public.update_personal_reminder(uuid,integer,integer,time,text,date,timestamptz,integer) from public,anon;
grant execute on function public.update_personal_reminder(uuid,integer,integer,time,text,date,timestamptz,integer) to authenticated;

create or replace function public.update_personal_reminder(
  target_reminder_id uuid,
  expected_schedule_version integer,
  input_offset_days integer,
  input_local_time time,
  input_timezone text,
  input_scheduled_local_date date,
  input_scheduled_for_utc timestamptz,
  input_timezone_offset_minutes integer
)
returns table(id uuid, updated_at timestamptz, schedule_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder public.reminders%rowtype;
  item public.roadmap_items%rowtype;
begin
  select * into reminder from public.reminders as candidate where candidate.id = target_reminder_id for update;
  if not found
    or reminder.user_id <> auth.uid()
    or reminder.status <> 'scheduled'
    or not private.is_active_household_member(reminder.household_id) then
    raise exception 'Reminder is unavailable.' using errcode = '42501';
  end if;
  if reminder.schedule_version <> expected_schedule_version then
    raise exception 'Reminder is stale.' using errcode = '40001';
  end if;
  select * into item from public.roadmap_items as candidate where candidate.id = reminder.roadmap_item_id;
  if not found
    or item.household_id is distinct from reminder.household_id
    or item.archived_at is not null
    or item.due_date is null
    or item.status in ('completed', 'cancelled') then
    raise exception 'Reminder item is unavailable.' using errcode = '42501';
  end if;
  if input_offset_days not in (0, 1, 3, 7)
    or input_timezone !~ '^[A-Za-z_]+/[A-Za-z_]+(?:/[A-Za-z_]+)?$'
    or input_scheduled_local_date <> item.due_date - input_offset_days
    or input_scheduled_for_utc <= now() + interval '5 minutes' then
    raise exception 'Reminder schedule is unavailable.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.reminders as other_reminder
    where other_reminder.roadmap_item_id = reminder.roadmap_item_id
      and other_reminder.user_id = reminder.user_id
      and other_reminder.id <> reminder.id
      and other_reminder.status in ('scheduled', 'processing')
      and other_reminder.offset_days = input_offset_days
      and other_reminder.scheduled_local_time = input_local_time
      and other_reminder.timezone = input_timezone
  ) then
    raise exception 'Reminder schedule already exists.' using errcode = '23505';
  end if;
  update public.reminders as candidate
  set
    offset_days = input_offset_days,
    scheduled_local_date = input_scheduled_local_date,
    scheduled_local_time = input_local_time,
    timezone = input_timezone,
    timezone_offset_minutes = input_timezone_offset_minutes,
    scheduled_for_utc = input_scheduled_for_utc,
    next_attempt_at = input_scheduled_for_utc,
    schedule_version = candidate.schedule_version + 1,
    attempt_count = 0,
    locked_at = null,
    locked_by = null
  where candidate.id = reminder.id
  returning candidate.id, candidate.updated_at, candidate.schedule_version into id, updated_at, schedule_version;
  return next;
end;
$$;

revoke all on function public.update_personal_reminder(uuid, integer, integer, time, text, date, timestamptz, integer) from public, anon;
grant execute on function public.update_personal_reminder(uuid, integer, integer, time, text, date, timestamptz, integer) to authenticated;
