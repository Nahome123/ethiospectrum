-- Each workspace (family, specialist, administrator) shows only its own
-- notifications. The audience is derived from the notification type prefix,
-- and the notification functions accept an optional audience filter; without
-- one they behave as before.

create function private.notification_audience(input_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when input_type like 'admin\_%' then 'admin'
    when input_type like 'specialist\_%' then 'specialist'
    else 'family'
  end;
$$;

grant execute on function private.notification_audience(text) to authenticated;

create function private.require_notification_audience(input_audience text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if input_audience is not null and input_audience not in ('family', 'specialist', 'admin') then
    raise exception 'Unknown notification audience.' using errcode = '22023';
  end if;
end;
$$;

grant execute on function private.require_notification_audience(text) to authenticated;

drop function public.get_notification_summary();
drop function public.list_notifications(integer);
drop function public.mark_notifications_read(uuid[]);

create function public.get_notification_summary(input_audience text default null)
returns table (unread_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_notification_audience(input_audience);
  return query
  select count(*) from public.notifications as notification
  where notification.recipient_id = auth.uid()
    and notification.read_at is null
    and (input_audience is null or private.notification_audience(notification.notification_type) = input_audience);
end;
$$;

create function public.list_notifications(input_page integer default 1, input_audience text default null)
returns table (
  id uuid,
  notification_type text,
  payload jsonb,
  link_path text,
  read_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_notification_audience(input_audience);
  return query
  select notification.id, notification.notification_type, notification.payload,
    notification.link_path, notification.read_at, notification.created_at,
    count(*) over ()
  from public.notifications as notification
  where notification.recipient_id = auth.uid()
    and (input_audience is null or private.notification_audience(notification.notification_type) = input_audience)
  order by notification.created_at desc, notification.id
  limit 20 offset (greatest(coalesce(input_page, 1), 1) - 1) * 20;
end;
$$;

create function public.mark_notifications_read(target_ids uuid[] default null, input_audience text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  perform private.require_notification_audience(input_audience);
  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null
    and (target_ids is null or id = any(target_ids))
    and (input_audience is null or private.notification_audience(notification_type) = input_audience);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.get_notification_summary(text) from public, anon;
revoke all on function public.list_notifications(integer, text) from public, anon;
revoke all on function public.mark_notifications_read(uuid[], text) from public, anon;
grant execute on function public.get_notification_summary(text) to authenticated;
grant execute on function public.list_notifications(integer, text) to authenticated;
grant execute on function public.mark_notifications_read(uuid[], text) to authenticated;
