-- Server-side audit entries (member deletion, membership changes) are written
-- through this function instead of a direct table insert, so they do not
-- depend on table privileges granted to the service role. An actor without a
-- profile is recorded as null rather than failing the foreign key.

create function public.record_admin_audit_event(
  input_actor_id uuid,
  input_action text,
  input_entity_type text,
  input_entity_id uuid default null,
  input_household_id uuid default null,
  input_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Audit events are recorded by the server only.' using errcode = '42501';
  end if;
  if input_action !~ '^[a-z_]{3,64}$' or input_entity_type !~ '^[a-z_]{3,64}$'
    or jsonb_typeof(coalesce(input_metadata, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(input_metadata, '{}'::jsonb)::text) > 4096 then
    raise exception 'Invalid audit event.' using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_id, household_id, action, entity_type, entity_id, metadata)
  values (
    (select profile.id from public.profiles as profile where profile.id = input_actor_id),
    (select household.id from public.households as household where household.id = input_household_id),
    input_action,
    input_entity_type,
    input_entity_id,
    coalesce(input_metadata, '{}'::jsonb)
  )
  returning id into created;
  return created;
end;
$$;

revoke all on function public.record_admin_audit_event(uuid, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_admin_audit_event(uuid, text, text, uuid, uuid, jsonb) to service_role;
