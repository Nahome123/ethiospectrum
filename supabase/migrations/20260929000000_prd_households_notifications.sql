-- PRD v1.0 (Phase 1): household owner + one caregiver, household contact data,
-- dependent service information, automatic household creation at registration,
-- and the shared in-app/email notification outbox used by every later phase.
--
-- Launch roles map onto the existing boundary: HOUSEHOLD_OWNER is the active
-- `owner` membership and CAREGIVER is the single active `member` membership,
-- whose capabilities are the owner-granted `caregiver_permissions` below.
-- Legacy `administrator`/`viewer` household permissions stay valid for the
-- retired demo features but are never granted by a launch workflow.

-- 1. Profile phone and household contact information -------------------------

alter table public.profiles add column if not exists phone text;
alter table public.profiles drop constraint if exists profiles_phone_valid;
alter table public.profiles add constraint profiles_phone_valid check (
  phone is null or (phone = btrim(phone) and phone ~ '^[0-9+() .-]{7,32}$')
);
grant update (phone) on public.profiles to authenticated;

alter table public.households add column if not exists contact_phone text;
alter table public.households add column if not exists contact_email text;
alter table public.households add column if not exists contact_notes text;
alter table public.households drop constraint if exists households_contact_phone_valid;
alter table public.households add constraint households_contact_phone_valid check (
  contact_phone is null or (contact_phone = btrim(contact_phone) and contact_phone ~ '^[0-9+() .-]{7,32}$')
);
alter table public.households drop constraint if exists households_contact_email_valid;
alter table public.households add constraint households_contact_email_valid check (
  contact_email is null or (contact_email = lower(btrim(contact_email)) and char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
alter table public.households drop constraint if exists households_contact_notes_valid;
alter table public.households add constraint households_contact_notes_valid check (
  contact_notes is null or (contact_notes = btrim(contact_notes) and char_length(contact_notes) <= 1000)
);
grant update (contact_phone, contact_email, contact_notes) on public.households to authenticated;

-- 2. Caregiver permissions ---------------------------------------------------

create or replace function private.valid_caregiver_permissions(input text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select input is not null
    and cardinality(input) <= 8
    and input <@ array[
      'submit_requests', 'confirm_appointments', 'make_payments',
      'access_training', 'upload_documents', 'manage_subscription'
    ]::text[];
$$;

alter table public.household_members
  add column if not exists caregiver_permissions text[] not null default array[]::text[];
alter table public.household_members drop constraint if exists household_members_caregiver_permissions_valid;
alter table public.household_members add constraint household_members_caregiver_permissions_valid
  check (private.valid_caregiver_permissions(caregiver_permissions));

-- True when the caller is the active owner, or the active caregiver the owner
-- granted `required_permission`. This is the launch authorization primitive.
create or replace function private.household_actor_can(target_household uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.household_members as membership
    join public.households as household on household.id = membership.household_id
    where membership.household_id = target_household
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and household.deleted_at is null
      and (
        membership.permission = 'owner'::public.household_permission
        or (
          membership.permission = 'member'::public.household_permission
          and required_permission = any(membership.caregiver_permissions)
        )
      )
  );
$$;

-- Same check for a server-side (service-role) caller acting for a known user.
create or replace function private.household_user_can(
  target_household uuid,
  target_user uuid,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user is not null and exists (
    select 1
    from public.household_members as membership
    join public.households as household on household.id = membership.household_id
    where membership.household_id = target_household
      and membership.user_id = target_user
      and membership.status = 'active'
      and household.deleted_at is null
      and (
        membership.permission = 'owner'::public.household_permission
        or (
          membership.permission = 'member'::public.household_permission
          and required_permission = any(membership.caregiver_permissions)
        )
      )
  );
$$;

create or replace function private.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select membership.household_id
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = auth.uid()
    and membership.status = 'active'
    and household.deleted_at is null
  order by (membership.permission = 'owner'::public.household_permission) desc, membership.created_at
  limit 1;
$$;

-- 3. Dependents: service needs and delivery information; caregivers manage ---

alter table public.dependents add column if not exists service_needs text;
alter table public.dependents add column if not exists communication_considerations text;
alter table public.dependents add column if not exists preferred_language text;
alter table public.dependents add column if not exists educational_information text;
alter table public.dependents add column if not exists behavioral_information text;
alter table public.dependents drop constraint if exists dependents_service_needs_valid;
alter table public.dependents add constraint dependents_service_needs_valid check (
  service_needs is null or (service_needs = btrim(service_needs) and char_length(service_needs) <= 2000)
);
alter table public.dependents drop constraint if exists dependents_communication_valid;
alter table public.dependents add constraint dependents_communication_valid check (
  communication_considerations is null
  or (communication_considerations = btrim(communication_considerations) and char_length(communication_considerations) <= 2000)
);
alter table public.dependents drop constraint if exists dependents_preferred_language_valid;
alter table public.dependents add constraint dependents_preferred_language_valid check (
  preferred_language is null or preferred_language in ('en', 'am', 'es')
);
alter table public.dependents drop constraint if exists dependents_educational_information_valid;
alter table public.dependents add constraint dependents_educational_information_valid check (
  educational_information is null
  or (educational_information = btrim(educational_information) and char_length(educational_information) <= 2000)
);
alter table public.dependents drop constraint if exists dependents_behavioral_information_valid;
alter table public.dependents add constraint dependents_behavioral_information_valid check (
  behavioral_information is null
  or (behavioral_information = btrim(behavioral_information) and char_length(behavioral_information) <= 2000)
);

create or replace function private.normalize_dependent_service_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.service_needs = nullif(btrim(new.service_needs), '');
  new.communication_considerations = nullif(btrim(new.communication_considerations), '');
  new.preferred_language = nullif(btrim(new.preferred_language), '');
  new.educational_information = nullif(btrim(new.educational_information), '');
  new.behavioral_information = nullif(btrim(new.behavioral_information), '');
  return new;
end;
$$;

drop trigger if exists dependents_normalize_service_fields on public.dependents;
create trigger dependents_normalize_service_fields
  before insert or update on public.dependents
  for each row execute function private.normalize_dependent_service_fields();

-- The PRD lets the caregiver manage dependents; the legacy household
-- administrator keeps the access it already had.
drop policy if exists dependents_insert_owners_and_administrators on public.dependents;
drop policy if exists dependents_update_owners_and_administrators on public.dependents;
drop policy if exists dependents_insert_household_managers on public.dependents;
drop policy if exists dependents_update_household_managers on public.dependents;
create policy dependents_insert_household_managers on public.dependents
  for insert to authenticated
  with check (
    archived_at is null
    and created_by = auth.uid()
    and private.has_household_permission(
      household_id, array['owner', 'administrator', 'member']::public.household_permission[]
    )
  );
create policy dependents_update_household_managers on public.dependents
  for update to authenticated
  using (
    archived_at is null
    and private.has_household_permission(
      household_id, array['owner', 'administrator', 'member']::public.household_permission[]
    )
  )
  with check (
    private.has_household_permission(
      household_id, array['owner', 'administrator', 'member']::public.household_permission[]
    )
  );

-- 4. Notifications -------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references auth.users(id) on delete cascade,
  recipient_email text check (
    recipient_email is null
    or (recipient_email = lower(btrim(recipient_email)) and char_length(recipient_email) <= 254)
  ),
  household_id uuid references public.households(id) on delete cascade,
  service_request_id uuid,
  notification_type text not null check (notification_type ~ '^[a-z_]{3,64}$'),
  payload jsonb not null default '{}'::jsonb check (
    jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2048
  ),
  link_path text check (link_path is null or (link_path ~ '^/[A-Za-z0-9/_?=&.-]*$' and char_length(link_path) <= 300)),
  read_at timestamptz,
  email_status text not null default 'pending' check (email_status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  email_attempts integer not null default 0 check (email_attempts between 0 and 5),
  email_error_code text check (email_error_code is null or email_error_code ~ '^[a-z0-9_]{1,80}$'),
  email_locked_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_recipient_present check (recipient_id is not null or recipient_email is not null)
);

create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_email_pending_idx on public.notifications (created_at) where email_status in ('pending', 'sending');

alter table public.notifications enable row level security;
alter table public.notifications force row level security;
create policy notifications_recipient_read on public.notifications
  for select to authenticated using (recipient_id = auth.uid());
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant select, update on public.notifications to service_role;

create or replace function private.notify(
  target_user uuid,
  input_type text,
  target_household uuid default null,
  target_request uuid default null,
  input_payload jsonb default '{}'::jsonb,
  input_link text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_user is null then return; end if;
  insert into public.notifications (
    recipient_id, household_id, service_request_id, notification_type, payload, link_path
  ) values (
    target_user, target_household, target_request, input_type,
    coalesce(input_payload, '{}'::jsonb), input_link
  );
end;
$$;

-- Owner plus the active caregiver of a household.
create or replace function private.notify_household(
  target_household uuid,
  input_type text,
  target_request uuid default null,
  input_payload jsonb default '{}'::jsonb,
  input_link text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare member_row record;
begin
  for member_row in
    select membership.user_id
    from public.household_members as membership
    where membership.household_id = target_household
      and membership.status = 'active'
      and membership.permission in ('owner'::public.household_permission, 'member'::public.household_permission)
  loop
    perform private.notify(member_row.user_id, input_type, target_household, target_request, input_payload, input_link);
  end loop;
end;
$$;

create or replace function private.notify_administrators(
  input_type text,
  target_household uuid default null,
  target_request uuid default null,
  input_payload jsonb default '{}'::jsonb,
  input_link text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare admin_row record;
begin
  for admin_row in
    select role_row.user_id from public.user_roles as role_row
    where role_row.role = 'administrator'::public.app_role
  loop
    perform private.notify(admin_row.user_id, input_type, target_household, target_request, input_payload, input_link);
  end loop;
end;
$$;

create or replace function public.get_notification_summary()
returns table (unread_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.notifications
  where recipient_id = auth.uid() and read_at is null;
$$;

create or replace function public.list_notifications(input_page integer default 1)
returns table (
  id uuid,
  notification_type text,
  payload jsonb,
  link_path text,
  read_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select notification.id, notification.notification_type, notification.payload,
    notification.link_path, notification.read_at, notification.created_at,
    count(*) over ()
  from public.notifications as notification
  where notification.recipient_id = auth.uid()
  order by notification.created_at desc, notification.id
  limit 20 offset (greatest(coalesce(input_page, 1), 1) - 1) * 20;
$$;

create or replace function public.mark_notifications_read(target_ids uuid[] default null)
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
  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null
    and (target_ids is null or id = any(target_ids));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Email outbox: the server-only worker claims pending rows with a lease, sends
-- through the configured provider, and completes or fails each row. Recipient
-- addresses are resolved here so the application never enumerates Auth users.
create or replace function public.claim_notification_emails(batch_size integer default 20)
returns table (
  id uuid,
  recipient_email text,
  recipient_locale text,
  recipient_first_name text,
  notification_type text,
  payload jsonb,
  link_path text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Notification worker authorization is required.' using errcode = '42501';
  end if;
  return query
  with candidates as (
    select notification.id
    from public.notifications as notification
    where (
        notification.email_status = 'pending'
        or (notification.email_status = 'sending' and notification.email_locked_at < now() - interval '10 minutes')
      )
      and notification.email_attempts < 5
    order by notification.created_at
    limit least(greatest(coalesce(batch_size, 20), 1), 100)
    for update skip locked
  ), claimed as (
    update public.notifications as notification
    set email_status = 'sending', email_locked_at = now(), email_attempts = notification.email_attempts + 1
    from candidates
    where notification.id = candidates.id
    returning notification.*
  )
  select claimed.id,
    coalesce(claimed.recipient_email, lower(auth_user.email)),
    coalesce(profile.preferred_locale, 'en'),
    profile.first_name,
    claimed.notification_type,
    claimed.payload,
    claimed.link_path
  from claimed
  left join auth.users as auth_user on auth_user.id = claimed.recipient_id
  left join public.profiles as profile on profile.id = claimed.recipient_id;
end;
$$;

create or replace function public.complete_notification_email(
  target_notification_id uuid,
  input_outcome text,
  input_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or input_outcome not in ('sent', 'failed', 'skipped')
    or (input_error_code is not null and input_error_code !~ '^[a-z0-9_]{1,80}$') then
    raise exception 'Notification worker authorization is required.' using errcode = '42501';
  end if;
  update public.notifications as notification
  set email_status = case
        when input_outcome = 'failed' and notification.email_attempts < 5 then 'pending'
        else input_outcome
      end,
      email_error_code = case when input_outcome = 'sent' then null else input_error_code end,
      emailed_at = case when input_outcome = 'sent' then now() else notification.emailed_at end,
      email_locked_at = null
  where notification.id = target_notification_id and notification.email_status = 'sending';
  -- An invitation bearer token is kept only until its final delivery outcome.
  update public.notifications as notification
  set payload = notification.payload - 'token', link_path = '/invitations'
  where notification.id = target_notification_id
    and notification.notification_type = 'caregiver_invitation'
    and notification.email_status in ('sent', 'failed', 'skipped');
end;
$$;

-- 5. Caregiver invitations -------------------------------------------------------

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  caregiver_permissions text[] not null check (private.valid_caregiver_permissions(caregiver_permissions)),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index household_invitations_one_pending_idx
  on public.household_invitations (household_id) where status = 'pending';

alter table public.household_invitations enable row level security;
alter table public.household_invitations force row level security;
create policy household_invitations_owner_read on public.household_invitations
  for select to authenticated
  using (private.has_household_permission(household_id, array['owner']::public.household_permission[]));
revoke all on public.household_invitations from public, anon, authenticated;
grant select (id, household_id, email, caregiver_permissions, status, expires_at, accepted_at, revoked_at, created_at)
  on public.household_invitations to authenticated;

create or replace function private.invitation_token_hash(raw_token text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(raw_token, ''), 'UTF8')), 'hex');
$$;

create or replace function public.create_caregiver_invitation(
  input_email text,
  input_permissions text[]
)
returns table (invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_household uuid;
  normalized_email text := lower(btrim(coalesce(input_email, '')));
  raw_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  created_id uuid;
  expiry timestamptz := now() + interval '7 days';
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select membership.household_id into target_household
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = current_user_id and membership.status = 'active'
    and membership.permission = 'owner' and household.deleted_at is null
  limit 1;
  if target_household is null then
    raise exception 'Only the household owner can invite a caregiver.' using errcode = '42501';
  end if;
  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(normalized_email) > 254 then
    raise exception 'A valid email address is required.' using errcode = '22023';
  end if;
  if not private.valid_caregiver_permissions(coalesce(input_permissions, array[]::text[])) then
    raise exception 'Invalid caregiver permissions.' using errcode = '22023';
  end if;
  if exists (
    select 1 from auth.users as auth_user where auth_user.id = current_user_id and lower(auth_user.email) = normalized_email
  ) then
    raise exception 'The owner cannot invite themselves.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.household_members as membership
    where membership.household_id = target_household and membership.status = 'active'
      and membership.permission <> 'owner'
  ) then
    raise exception 'This household already has a caregiver.' using errcode = '54000';
  end if;

  update public.household_invitations
  set status = 'expired', updated_at = now()
  where household_id = target_household and status = 'pending' and household_invitations.expires_at <= now();
  if exists (
    select 1 from public.household_invitations
    where household_id = target_household and status = 'pending'
  ) then
    raise exception 'Revoke the pending invitation before sending another.' using errcode = '54000';
  end if;

  insert into public.household_invitations (
    household_id, email, token_hash, caregiver_permissions, invited_by, expires_at
  ) values (
    target_household, normalized_email, private.invitation_token_hash(raw_token),
    (select coalesce(array_agg(distinct permission order by permission), array[]::text[]) from unnest(input_permissions) as permission),
    current_user_id, expiry
  ) returning id into created_id;

  insert into public.notifications (recipient_email, household_id, notification_type, payload, link_path, read_at)
  values (
    normalized_email, target_household, 'caregiver_invitation',
    jsonb_build_object('household_name', (select name from public.households where id = target_household), 'token', raw_token),
    '/invitations/' || raw_token,
    now()
  );

  return query select created_id, raw_token, expiry;
end;
$$;

create or replace function public.revoke_caregiver_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.household_invitations as invitation
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where invitation.id = target_invitation_id
    and invitation.status = 'pending'
    and private.has_household_permission(invitation.household_id, array['owner']::public.household_permission[]);
  if not found then
    raise exception 'Invitation is unavailable.' using errcode = '42501';
  end if;
  -- The invitation email must not be delivered after revocation.
  update public.notifications
  set email_status = 'skipped', email_error_code = 'invitation_revoked',
      payload = payload - 'token', link_path = '/invitations'
  where notification_type = 'caregiver_invitation' and email_status in ('pending', 'failed')
    and household_id = (select household_id from public.household_invitations where id = target_invitation_id);
end;
$$;

create or replace function public.get_caregiver_invitation(input_token text)
returns table (household_name text, invited_email text, status text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select household.name, invitation.email,
    case when invitation.status = 'pending' and invitation.expires_at <= now() then 'expired' else invitation.status end,
    invitation.expires_at
  from public.household_invitations as invitation
  join public.households as household on household.id = invitation.household_id
  where invitation.token_hash = private.invitation_token_hash(input_token)
    and household.deleted_at is null
  limit 1;
$$;

create or replace function public.accept_caregiver_invitation(input_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  invitation public.household_invitations%rowtype;
  current_email text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into invitation from public.household_invitations
  where token_hash = private.invitation_token_hash(input_token)
  for update;
  if invitation.id is null or invitation.status <> 'pending' or invitation.expires_at <= now() then
    raise exception 'This invitation is no longer available.' using errcode = '55000';
  end if;
  select lower(email) into current_email from auth.users where id = current_user_id;
  if current_email is distinct from invitation.email then
    raise exception 'Sign in with the invited email address to accept.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.household_members as membership
    join public.households as household on household.id = membership.household_id
    where membership.user_id = current_user_id and membership.status = 'active' and household.deleted_at is null
  ) then
    raise exception 'This account already belongs to a household.' using errcode = '54000';
  end if;
  perform 1 from public.households where id = invitation.household_id for update;
  if exists (
    select 1 from public.household_members as membership
    where membership.household_id = invitation.household_id and membership.status = 'active'
      and membership.permission <> 'owner'
  ) then
    raise exception 'This household already has a caregiver.' using errcode = '54000';
  end if;

  insert into public.household_members (
    household_id, user_id, relationship, permission, status, invited_by, joined_at, caregiver_permissions
  ) values (
    invitation.household_id, current_user_id, 'caregiver', 'member', 'active',
    invitation.invited_by, now(), invitation.caregiver_permissions
  )
  on conflict (household_id, user_id) do update
  set permission = 'member', status = 'active', relationship = 'caregiver',
      caregiver_permissions = excluded.caregiver_permissions, joined_at = now(), updated_at = now();

  update public.household_invitations
  set status = 'accepted', accepted_by = current_user_id, accepted_at = now(), updated_at = now()
  where id = invitation.id;

  perform private.notify(
    invitation.invited_by, 'caregiver_joined', invitation.household_id, null,
    jsonb_build_object('caregiver_email', invitation.email), '/household'
  );
  return invitation.household_id;
end;
$$;

create or replace function public.update_caregiver_permissions(
  target_member_id uuid,
  input_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.valid_caregiver_permissions(coalesce(input_permissions, array[]::text[])) then
    raise exception 'Invalid caregiver permissions.' using errcode = '22023';
  end if;
  update public.household_members as membership
  set caregiver_permissions = (
        select coalesce(array_agg(distinct permission order by permission), array[]::text[])
        from unnest(input_permissions) as permission
      ),
      updated_at = now()
  where membership.id = target_member_id
    and membership.status = 'active'
    and membership.permission = 'member'
    and private.has_household_permission(membership.household_id, array['owner']::public.household_permission[]);
  if not found then
    raise exception 'Caregiver is unavailable.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.remove_caregiver(target_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare removed_user uuid; removed_household uuid;
begin
  update public.household_members as membership
  set status = 'removed', caregiver_permissions = array[]::text[], updated_at = now()
  where membership.id = target_member_id
    and membership.status = 'active'
    and membership.permission <> 'owner'
    and private.has_household_permission(membership.household_id, array['owner']::public.household_permission[])
  returning membership.user_id, membership.household_id into removed_user, removed_household;
  if removed_user is null then
    raise exception 'Caregiver is unavailable.' using errcode = '42501';
  end if;
  perform private.notify(removed_user, 'caregiver_removed', null, null, '{}'::jsonb, '/dashboard');
end;
$$;

-- Household members see each other's display names (never Auth email).
create or replace function public.list_household_people()
returns table (
  member_id uuid,
  user_id uuid,
  display_name text,
  permission public.household_permission,
  relationship text,
  caregiver_permissions text[],
  joined_at timestamptz,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select membership.id, membership.user_id,
    coalesce(nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Household member'),
    membership.permission, membership.relationship, membership.caregiver_permissions,
    membership.joined_at, membership.user_id = auth.uid()
  from public.household_members as membership
  left join public.profiles as profile on profile.id = membership.user_id
  where membership.household_id = private.current_household_id()
    and membership.status = 'active'
  order by (membership.permission = 'owner') desc, membership.joined_at;
$$;

create or replace function public.get_current_household_access()
returns table (
  household_id uuid,
  household_name text,
  permission public.household_permission,
  is_owner boolean,
  caregiver_permissions text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select household.id, household.name, membership.permission,
    membership.permission = 'owner'::public.household_permission,
    case when membership.permission = 'owner'::public.household_permission
      then array['submit_requests','confirm_appointments','make_payments','access_training','upload_documents','manage_subscription']::text[]
      else membership.caregiver_permissions end
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = auth.uid()
    and membership.status = 'active'
    and household.deleted_at is null
    and household.id = private.current_household_id()
  limit 1;
$$;

-- 6. Registration: a household owner's household is created automatically ------

create or replace function private.handle_new_household_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  last_name text := nullif(left(btrim(coalesce(metadata ->> 'last_name', '')), 80), '');
  first_name text := nullif(left(btrim(coalesce(metadata ->> 'first_name', '')), 80), '');
  terms_version text := nullif(left(btrim(coalesce(metadata ->> 'terms_policy_version', '')), 64), '');
  household_name text;
  created_household_id uuid;
begin
  perform private.notify(new.id, 'account_created', null, null, '{}'::jsonb, '/dashboard');

  if metadata ->> 'account_intent' is distinct from 'household_owner' then
    return new;
  end if;
  household_name := left(coalesce(last_name, first_name, 'My') || ' household', 160);
  insert into public.households (name, primary_owner_id, created_by)
  values (household_name, new.id, new.id)
  returning id into created_household_id;
  insert into public.household_members (household_id, user_id, permission, status, joined_at, relationship)
  values (created_household_id, new.id, 'owner', 'active', now(), 'owner');
  if terms_version is not null then
    insert into public.consents (user_id, consent_type, policy_version)
    values (new.id, 'household_onboarding', terms_version)
    on conflict (user_id, consent_type, policy_version) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_household on auth.users;
create trigger on_auth_user_created_household
  after insert on auth.users
  for each row execute function private.handle_new_household_owner();

-- 7. Grants ----------------------------------------------------------------------

revoke all on function private.valid_caregiver_permissions(text[]) from public, anon;
revoke all on function private.household_actor_can(uuid, text) from public, anon;
revoke all on function private.household_user_can(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.current_household_id() from public, anon;
revoke all on function private.normalize_dependent_service_fields() from public, anon, authenticated;
revoke all on function private.notify(uuid, text, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function private.notify_household(uuid, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function private.notify_administrators(text, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function private.invitation_token_hash(text) from public, anon, authenticated;
revoke all on function private.handle_new_household_owner() from public, anon, authenticated;
grant execute on function private.valid_caregiver_permissions(text[]) to authenticated, service_role;
grant execute on function private.household_actor_can(uuid, text) to authenticated;
grant execute on function private.household_user_can(uuid, uuid, text) to service_role;
grant execute on function private.current_household_id() to authenticated;

revoke all on function public.get_notification_summary() from public, anon;
revoke all on function public.list_notifications(integer) from public, anon;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
revoke all on function public.claim_notification_emails(integer) from public, anon, authenticated;
revoke all on function public.complete_notification_email(uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_caregiver_invitation(text, text[]) from public, anon;
revoke all on function public.revoke_caregiver_invitation(uuid) from public, anon;
revoke all on function public.get_caregiver_invitation(text) from public, anon;
revoke all on function public.accept_caregiver_invitation(text) from public, anon;
revoke all on function public.update_caregiver_permissions(uuid, text[]) from public, anon;
revoke all on function public.remove_caregiver(uuid) from public, anon;
revoke all on function public.list_household_people() from public, anon;
revoke all on function public.get_current_household_access() from public, anon;
grant execute on function public.get_notification_summary() to authenticated;
grant execute on function public.list_notifications(integer) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.claim_notification_emails(integer) to service_role;
grant execute on function public.complete_notification_email(uuid, text, text) to service_role;
grant execute on function public.create_caregiver_invitation(text, text[]) to authenticated;
grant execute on function public.revoke_caregiver_invitation(uuid) to authenticated;
grant execute on function public.get_caregiver_invitation(text) to authenticated;
grant execute on function public.accept_caregiver_invitation(text) to authenticated;
grant execute on function public.update_caregiver_permissions(uuid, text[]) to authenticated;
grant execute on function public.remove_caregiver(uuid) to authenticated;
grant execute on function public.list_household_people() to authenticated;
grant execute on function public.get_current_household_access() to authenticated;
