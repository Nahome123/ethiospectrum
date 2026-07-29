-- ETH-019 corrective migration: return only the bounded, completed history a
-- service-only worker needs. Browser roles remain unable to read messages
-- directly, and the worker receives no table-level access.

create or replace function public.get_document_chat_worker_history(target_conversation_id uuid)
returns table (
  role text,
  content text,
  sequence_number bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Document chat worker authorization is required.' using errcode = '42501';
  end if;
  if target_conversation_id is null then
    raise exception 'A conversation is required.' using errcode = '22023';
  end if;

  return query
  select recent.role, recent.content, recent.sequence_number
  from (
    select message.role, message.content, message.sequence_number
    from public.document_chat_messages as message
    where message.conversation_id = target_conversation_id
      and message.status = 'completed'
      and message.role in ('user', 'assistant')
      and message.content is not null
    order by message.sequence_number desc
    limit 10
  ) as recent
  order by recent.sequence_number asc;
end;
$$;

revoke all on function public.get_document_chat_worker_history(uuid) from public, anon, authenticated;
grant execute on function public.get_document_chat_worker_history(uuid) to service_role;
