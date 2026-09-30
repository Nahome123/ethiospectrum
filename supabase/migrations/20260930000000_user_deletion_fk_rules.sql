-- Account deletion: give every foreign key to auth.users / public.profiles an
-- explicit ON DELETE rule so that deleting an Auth user (Dashboard, Admin API,
-- or account closure) no longer fails with "Database error deleting user".
--
-- Rules:
--   * Household ownership: deleting the primary owner deletes that household
--     and, through the existing household cascades, everything scoped to it.
--     A household cannot exist without its single owner, and ownership is not
--     transferred automatically to a caregiver.
--   * Specialist profiles: kept as a historical record with user_id set to
--     null, so assigned requests and appointments still resolve their
--     specialist while the deleted account can no longer act as one.
--   * Personal rows (a user's own reminders, feedback, pending invitations they
--     sent): deleted with the user.
--   * Actor / audit columns (who created, uploaded, reviewed, paid, proposed):
--     set to null so shared household, request, payment and content records
--     survive the deletion of the person who acted on them.

create function pg_temp.set_fk_rule(
  target_table regclass,
  target_column name,
  referenced regclass,
  rule text
) returns void
language plpgsql
as $$
declare
  existing name;
begin
  select c.conname into existing
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f'
    and c.conrelid = target_table
    and a.attname = target_column
    and c.confrelid = referenced
    and cardinality(c.conkey) = 1;

  if existing is null then
    raise exception 'no single-column foreign key %.% -> %', target_table, target_column, referenced;
  end if;

  if rule = 'set null' then
    execute format('alter table %s alter column %I drop not null', target_table, target_column);
  end if;

  execute format('alter table %s drop constraint %I', target_table, existing);
  execute format(
    'alter table %s add constraint %I foreign key (%I) references %s (id) on delete %s',
    target_table, existing, target_column, referenced, rule
  );
end;
$$;

-- Household ownership.
select pg_temp.set_fk_rule('public.households', 'primary_owner_id', 'auth.users', 'cascade');
select pg_temp.set_fk_rule('public.households', 'created_by', 'auth.users', 'set null');

-- Specialist profiles.
select pg_temp.set_fk_rule('public.specialists', 'user_id', 'public.profiles', 'set null');

-- Personal rows.
select pg_temp.set_fk_rule('public.ai_feedback', 'user_id', 'public.profiles', 'cascade');
select pg_temp.set_fk_rule('public.reminders', 'user_id', 'public.profiles', 'cascade');
select pg_temp.set_fk_rule('public.household_invitations', 'invited_by', 'auth.users', 'cascade');

-- Actor and audit columns referencing auth.users.
select pg_temp.set_fk_rule('public.dependents', 'created_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.household_invitations', 'accepted_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.household_members', 'invited_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.user_roles', 'granted_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.appointments', 'proposed_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.appointments', 'cancelled_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.appointments', 'completed_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.appointments', 'consented_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.appointments', 'declined_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.appointment_events', 'actor_user_id', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.roadmap_items', 'created_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.roadmap_items', 'assigned_to', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.support_threads', 'created_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.support_threads', 'cancelled_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.support_threads', 'closed_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.support_threads', 'specialist_assigned_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.training_courses', 'created_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.training_lesson_progress', 'updated_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_requests', 'requested_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_requests', 'cancelled_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_requests', 'completed_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_request_activities', 'completed_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_request_events', 'actor_id', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_request_messages', 'author_id', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_appointments', 'proposed_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_appointments', 'confirmed_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_appointments', 'cancelled_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_appointments', 'completed_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_fees', 'created_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_payments', 'payer_user_id', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_refunds', 'customer_user_id', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_refunds', 'requested_by', 'auth.users', 'set null');
select pg_temp.set_fk_rule('public.service_refunds', 'processed_by', 'auth.users', 'set null');

-- Actor and audit columns referencing public.profiles.
select pg_temp.set_fk_rule('public.audit_logs', 'actor_id', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.conversations', 'created_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.documents', 'uploaded_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.document_summaries', 'requested_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.document_questions', 'requested_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.document_chat_conversations', 'created_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.document_chat_messages', 'created_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.household_specialists', 'assigned_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.support_messages', 'sender_id', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.resources', 'author_id', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.resources', 'updated_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.resources', 'published_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.resources', 'archived_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.resource_translations', 'created_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.resource_translations', 'updated_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.resource_translations', 'submitted_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.resource_translations', 'reviewed_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.resource_account_access', 'assigned_by', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.resource_audit_events', 'actor_user_id', 'public.profiles', 'set null');
select pg_temp.set_fk_rule('public.resource_translation_audit_events', 'actor_user_id', 'public.profiles', 'set null');

-- Immutability guards vs. referential actions --------------------------------
--
-- Several tables reject updates to identity/actor columns and deletes of
-- history rows. Those guards must not block the referential actions above.
-- When an auth.users row is deleted, its id is recorded in a
-- transaction-local setting (not reachable through PostgREST). For the rest of
-- that transaction, guard triggers skip only:
--   * updates whose every change is one of those ids becoming null (plus the
--     updated_at stamp), and
--   * deletes issued by a referential action (trigger depth > 0), i.e. history
--     rows cascading from the deleted household. A direct DELETE is still
--     refused.
-- The marker cannot be cleared by an AFTER STATEMENT trigger: referential
-- actions defer their nested cascades past it.
-- The functions deliberately have no SET clause: a function-level SET would
-- roll back the transaction-local setting when the function returns.

create function private.user_deletion_ids()
returns text[]
language sql
stable
as $$
  select pg_catalog.string_to_array(
    nullif(pg_catalog.current_setting('ethiospectrum.deleting_user_ids', true), ''),
    ','
  );
$$;

create function private.user_deletion_in_progress()
returns boolean
language sql
stable
as $$
  select pg_catalog.cardinality(coalesce(private.user_deletion_ids(), '{}'::text[])) > 0;
$$;

create function private.is_user_deletion_update(old_row jsonb, new_row jsonb)
returns boolean
language sql
stable
as $$
  select private.user_deletion_in_progress()
    and not exists (
      select 1
      from pg_catalog.jsonb_each(old_row) as changed(key, value)
      where changed.key <> 'updated_at'
        and changed.value is distinct from new_row -> changed.key
        and not (
          new_row -> changed.key = 'null'::jsonb
          and (changed.value #>> '{}') = any (private.user_deletion_ids())
        )
    );
$$;

grant execute on function private.user_deletion_ids() to authenticated, service_role;
grant execute on function private.user_deletion_in_progress() to authenticated, service_role;
grant execute on function private.is_user_deletion_update(jsonb, jsonb) to authenticated, service_role;

create function private.mark_user_deletion()
returns trigger
language plpgsql
as $$
begin
  perform pg_catalog.set_config(
    'ethiospectrum.deleting_user_ids',
    pg_catalog.concat_ws(',', nullif(pg_catalog.current_setting('ethiospectrum.deleting_user_ids', true), ''), old.id::text),
    true
  );
  return old;
end;
$$;

revoke all on function private.mark_user_deletion() from public;

-- Delete the owner's household before the user row itself, so its cascades
-- complete before any actor column elsewhere is nulled. The foreign key
-- cascade on households.primary_owner_id remains as the backstop.
create function private.delete_owned_households()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.households where primary_owner_id = old.id;
  return old;
end;
$$;

revoke all on function private.delete_owned_households() from public;

-- Triggers fire in name order: mark first, then delete owned households.
create trigger on_auth_user_deleting_1_mark
before delete on auth.users
for each row execute function private.mark_user_deletion();

create trigger on_auth_user_deleting_2_households
before delete on auth.users
for each row execute function private.delete_owned_households();

-- Recreate a guard trigger so that its UPDATE part skips user-deletion
-- updates and its DELETE part skips user-deletion cascades. An INSERT part
-- keeps firing unchanged under "<name>_on_insert" (WHEN cannot mention OLD
-- for INSERT); the suffix keeps its alphabetical firing position.
create function pg_temp.bypass_guard_during_user_deletion(target_table regclass, trigger_name name)
returns void
language plpgsql
as $$
declare
  t record;
  timing text;
begin
  select tg.tgtype, tg.tgfoid::regproc::text as fn, tg.tgnargs, tg.tgqual
  into t
  from pg_trigger tg
  where tg.tgrelid = target_table and tg.tgname = trigger_name and not tg.tgisinternal;

  if not found then
    raise exception 'trigger % on % not found', trigger_name, target_table;
  end if;
  if t.tgtype & 1 = 0 or t.tgnargs <> 0 or t.tgqual is not null then
    raise exception 'trigger % on % must be a row trigger without arguments or WHEN', trigger_name, target_table;
  end if;

  timing := case when t.tgtype & 2 <> 0 then 'before' else 'after' end;
  execute format('drop trigger %I on %s', trigger_name, target_table);

  if t.tgtype & 16 <> 0 then
    execute format(
      'create trigger %I %s update on %s for each row when (not private.is_user_deletion_update(to_jsonb(old), to_jsonb(new))) execute function %s()',
      trigger_name, timing, target_table, t.fn
    );
  end if;
  if t.tgtype & 8 <> 0 then
    execute format(
      'create trigger %I %s delete on %s for each row when (not (private.user_deletion_in_progress() and pg_trigger_depth() > 0)) execute function %s()',
      case when t.tgtype & 16 <> 0 then trigger_name || '_on_delete' else trigger_name end,
      timing, target_table, t.fn
    );
  end if;
  if t.tgtype & 4 <> 0 then
    execute format(
      'create trigger %I %s insert on %s for each row execute function %s()',
      trigger_name || '_on_insert', timing, target_table, t.fn
    );
  end if;
end;
$$;

select pg_temp.bypass_guard_during_user_deletion('public.households', 'households_protect_ownership');
select pg_temp.bypass_guard_during_user_deletion('public.dependents', 'dependents_normalize');
select pg_temp.bypass_guard_during_user_deletion('public.documents', 'documents_normalize');
select pg_temp.bypass_guard_during_user_deletion('public.appointments', 'appointments_validate_integrity');
select pg_temp.bypass_guard_during_user_deletion('public.appointment_events', 'appointment_events_immutable');
select pg_temp.bypass_guard_during_user_deletion('public.roadmap_items', 'roadmap_items_validate_integrity');
select pg_temp.bypass_guard_during_user_deletion('public.support_threads', 'support_threads_validate_integrity');
select pg_temp.bypass_guard_during_user_deletion('public.support_messages', 'support_messages_validate_integrity');
select pg_temp.bypass_guard_during_user_deletion('public.service_request_events', 'service_request_events_immutable');
select pg_temp.bypass_guard_during_user_deletion('public.service_request_messages', 'service_request_messages_immutable');
select pg_temp.bypass_guard_during_user_deletion('public.billing_events', 'billing_events_immutable');

-- Guard: no reference to a user may be left without a deletion rule.
do $$
declare
  remaining text;
begin
  select string_agg(format('%s.%s', c.conrelid::regclass, c.conname), ', ') into remaining
  from pg_constraint c
  where c.contype = 'f'
    and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
    and c.confdeltype in ('a', 'r');
  if remaining is not null then
    raise exception 'foreign keys to users without an ON DELETE rule: %', remaining;
  end if;
end;
$$;
