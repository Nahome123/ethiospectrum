-- PRD v1.0 (Phase 2): RBT Boot Camp.
--  * The household subscription plan becomes `rbt_bootcamp` (monthly).
--  * An authorized caregiver may manage the subscription.
--  * Protected training content: courses -> modules -> lessons with linked or
--    uploaded video and resources, readable only with an active subscription.
--  * Progress per learner: the signed-in household member or a dependent.
--  * Administrators maintain content; archiving never deletes learner progress.

-- 1. Subscription plan ----------------------------------------------------------

alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_plan_key_check;
alter table public.billing_subscriptions drop constraint if exists billing_subscription_entitlement_check;
update public.billing_subscriptions set plan_key = 'rbt_bootcamp' where plan_key = 'family_plus';
alter table public.billing_subscriptions add constraint billing_subscriptions_plan_key_check check (plan_key = 'rbt_bootcamp');
alter table public.billing_subscriptions add constraint billing_subscription_entitlement_check check (
  entitlement_status = 'inactive'
  or (entitlement_status = 'active' and plan_key = 'rbt_bootcamp' and stripe_status = 'active')
);

create or replace function public.get_household_billing_summary()
returns table (
  household_id uuid,
  household_name text,
  household_permission public.household_permission,
  plan_key text,
  billing_interval text,
  stripe_status text,
  entitlement_status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  cancelled_at timestamptz,
  provider_updated_at timestamptz,
  can_manage_billing boolean,
  can_view_invoices boolean,
  has_stripe_customer boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    household.id,
    household.name,
    membership.permission,
    case
      when subscription.stripe_status in ('canceled', 'incomplete_expired') then 'free'
      else coalesce(subscription.plan_key, 'free')
    end,
    case when manager.allowed then subscription.billing_interval end,
    case when manager.allowed then subscription.stripe_status end,
    coalesce(subscription.entitlement_status, 'inactive'),
    case when manager.allowed then subscription.current_period_start end,
    case when manager.allowed then subscription.current_period_end end,
    case when manager.allowed then coalesce(subscription.cancel_at_period_end, false) end,
    case when manager.allowed then subscription.cancelled_at end,
    case when manager.allowed then subscription.provider_updated_at end,
    manager.allowed,
    manager.allowed or membership.permission = 'administrator'::public.household_permission,
    customer.id is not null and manager.allowed
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  cross join lateral (
    select membership.permission = 'owner'::public.household_permission
      or (membership.permission = 'member'::public.household_permission and 'manage_subscription' = any(membership.caregiver_permissions))
      as allowed
  ) as manager
  left join public.billing_customers as customer on customer.household_id = household.id
  left join public.billing_subscriptions as subscription on subscription.household_id = household.id
  where membership.user_id = auth.uid()
    and membership.status = 'active'::public.membership_status
    and household.deleted_at is null
  order by (membership.permission = 'owner') desc, household.created_at
  limit 1;
$$;

create or replace function public.has_household_entitlement(input_entitlement text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select input_entitlement = 'rbt_bootcamp'
    and exists (
      select 1
      from public.household_members as membership
      join public.billing_subscriptions as subscription
        on subscription.household_id = membership.household_id
      where membership.user_id = auth.uid()
        and membership.status = 'active'::public.membership_status
        and subscription.plan_key = 'rbt_bootcamp'
        and subscription.stripe_status = 'active'
        and subscription.entitlement_status = 'active'
        and (subscription.current_period_end is null or subscription.current_period_end > now())
    );
$$;

create or replace function public.link_household_billing_customer(
  target_household_id uuid,
  target_actor_id uuid,
  input_stripe_customer_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare existing_customer public.billing_customers%rowtype;
begin
  if auth.role() <> 'service_role'
    or not (
      private.household_user_can(target_household_id, target_actor_id, 'manage_subscription')
      or private.household_user_can(target_household_id, target_actor_id, 'make_payments')
    ) then
    raise exception 'Billing operation is unavailable.' using errcode = '42501';
  end if;
  select * into existing_customer from public.billing_customers where household_id = target_household_id for update;
  if existing_customer.id is not null then
    if existing_customer.stripe_customer_id <> input_stripe_customer_id then
      raise exception 'Billing customer conflict.' using errcode = '40001';
    end if;
    return;
  end if;
  insert into public.billing_customers (household_id, stripe_customer_id)
  values (target_household_id, input_stripe_customer_id);
  insert into public.billing_events (household_id, actor_user_id, action)
  values (target_household_id, target_actor_id, 'customer_linked');
end;
$$;

create or replace function public.record_billing_checkout_started(
  target_household_id uuid,
  target_actor_id uuid,
  input_billing_interval text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role'
    or input_billing_interval <> 'month'
    or not private.household_user_can(target_household_id, target_actor_id, 'manage_subscription') then
    raise exception 'Billing operation is unavailable.' using errcode = '42501';
  end if;
  insert into public.billing_events (household_id, actor_user_id, action, safe_metadata)
  values (
    target_household_id,
    target_actor_id,
    'checkout_started',
    jsonb_build_object('plan_key', 'rbt_bootcamp', 'billing_interval', input_billing_interval)
  );
end;
$$;

create or replace function public.sync_billing_subscription(
  target_household_id uuid,
  input_stripe_customer_id text,
  input_stripe_subscription_id text,
  input_stripe_price_id text,
  input_billing_interval text,
  input_stripe_status text,
  input_current_period_start timestamptz,
  input_current_period_end timestamptz,
  input_cancel_at_period_end boolean,
  input_provider_updated_at timestamptz,
  input_cancelled_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare existing_subscription public.billing_subscriptions%rowtype;
declare next_entitlement text;
declare lifecycle_action text;
begin
  if auth.role() <> 'service_role'
    or input_billing_interval not in ('month','year')
    or input_stripe_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
    or not exists (
      select 1 from public.billing_customers
      where household_id = target_household_id and stripe_customer_id = input_stripe_customer_id
    ) then
    raise exception 'Subscription synchronization is unavailable.' using errcode = '42501';
  end if;
  next_entitlement := case when input_stripe_status = 'active' then 'active' else 'inactive' end;
  select * into existing_subscription from public.billing_subscriptions
    where household_id = target_household_id for update;
  if existing_subscription.id is not null
    and existing_subscription.provider_updated_at >= input_provider_updated_at then
    return false;
  end if;
  if existing_subscription.id is null then
    insert into public.billing_subscriptions (
      household_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
      plan_key, billing_interval, stripe_status, entitlement_status,
      current_period_start, current_period_end, cancel_at_period_end,
      cancelled_at, provider_updated_at
    ) values (
      target_household_id, input_stripe_customer_id, input_stripe_subscription_id,
      input_stripe_price_id, 'rbt_bootcamp', input_billing_interval,
      input_stripe_status, next_entitlement, input_current_period_start,
      input_current_period_end, input_cancel_at_period_end, input_cancelled_at,
      input_provider_updated_at
    );
    lifecycle_action := 'subscription_created';
  else
    update public.billing_subscriptions set
      stripe_customer_id = input_stripe_customer_id,
      stripe_subscription_id = input_stripe_subscription_id,
      stripe_price_id = input_stripe_price_id,
      billing_interval = input_billing_interval,
      stripe_status = input_stripe_status,
      entitlement_status = next_entitlement,
      current_period_start = input_current_period_start,
      current_period_end = input_current_period_end,
      cancel_at_period_end = input_cancel_at_period_end,
      cancelled_at = input_cancelled_at,
      provider_updated_at = input_provider_updated_at,
      version = version + 1,
      updated_at = now()
    where id = existing_subscription.id;
    lifecycle_action := case when input_stripe_status = 'canceled'
      then 'subscription_ended' else 'subscription_updated' end;
  end if;
  insert into public.billing_events (household_id, action, safe_metadata)
  values (
    target_household_id,
    lifecycle_action,
    jsonb_build_object(
      'plan_key', 'rbt_bootcamp', 'billing_interval', input_billing_interval,
      'stripe_status', input_stripe_status
    )
  );
  if input_cancel_at_period_end
    and (existing_subscription.id is null or not existing_subscription.cancel_at_period_end) then
    insert into public.billing_events (household_id, action)
    values (target_household_id, 'subscription_cancel_scheduled');
  end if;
  if next_entitlement = 'active'
    and (existing_subscription.id is null or existing_subscription.entitlement_status <> 'active') then
    insert into public.billing_events (household_id, action)
    values (target_household_id, 'entitlement_granted');
    perform private.notify_household(target_household_id, 'subscription_activated', null, '{}'::jsonb, '/training');
  elsif next_entitlement = 'inactive'
    and existing_subscription.id is not null
    and existing_subscription.entitlement_status = 'active' then
    insert into public.billing_events (household_id, action)
    values (target_household_id, 'entitlement_revoked');
    perform private.notify_household(target_household_id, 'subscription_inactive', null, '{}'::jsonb, '/billing');
  end if;
  return true;
end;
$$;

-- 2. Training access ---------------------------------------------------------

-- Administrators always; otherwise an active owner, or a caregiver granted
-- `access_training`, of a household with an active RBT Boot Camp subscription.
create or replace function private.has_training_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_current_user_administrator() or exists (
    select 1
    from public.household_members as membership
    join public.households as household on household.id = membership.household_id
    join public.billing_subscriptions as subscription on subscription.household_id = membership.household_id
    where membership.user_id = auth.uid()
      and membership.status = 'active'
      and household.deleted_at is null
      and (
        membership.permission = 'owner'::public.household_permission
        or (membership.permission = 'member'::public.household_permission and 'access_training' = any(membership.caregiver_permissions))
      )
      and subscription.plan_key = 'rbt_bootcamp'
      and subscription.stripe_status = 'active'
      and subscription.entitlement_status = 'active'
      and (subscription.current_period_end is null or subscription.current_period_end > now())
  );
$$;

create or replace function public.get_training_access()
returns table (has_access boolean, has_subscription boolean, can_subscribe boolean, is_administrator boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_training_access(),
    public.has_household_entitlement('rbt_bootcamp'),
    private.household_actor_can(private.current_household_id(), 'manage_subscription'),
    private.is_current_user_administrator();
$$;

-- 3. Content tables --------------------------------------------------------------

create table public.training_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  title text not null check (title = btrim(title) and char_length(title) between 2 and 160),
  description text check (description is null or char_length(description) <= 4000),
  localized jsonb not null default '{}'::jsonb check (jsonb_typeof(localized) = 'object' and octet_length(localized::text) <= 16384),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sequence integer not null default 100 check (sequence between 0 and 100000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete restrict,
  title text not null check (title = btrim(title) and char_length(title) between 2 and 160),
  description text check (description is null or char_length(description) <= 4000),
  localized jsonb not null default '{}'::jsonb check (jsonb_typeof(localized) = 'object' and octet_length(localized::text) <= 16384),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sequence integer not null default 100 check (sequence between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index training_modules_course_idx on public.training_modules (course_id, sequence);

create table public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules(id) on delete restrict,
  title text not null check (title = btrim(title) and char_length(title) between 2 and 160),
  description text check (description is null or char_length(description) <= 4000),
  body text check (body is null or char_length(body) <= 20000),
  localized jsonb not null default '{}'::jsonb check (jsonb_typeof(localized) = 'object' and octet_length(localized::text) <= 32768),
  -- External video (YouTube, Vimeo, or an HTTPS media file) or an uploaded private object.
  video_url text check (video_url is null or (video_url ~ '^https://' and char_length(video_url) <= 2048)),
  video_storage_path text check (video_storage_path is null or video_storage_path ~ '^lessons/[0-9a-f-]{36}/video/[a-z0-9._-]{1,120}$'),
  resource_url text check (resource_url is null or ((resource_url ~ '^https://' or resource_url ~ '^/training/[a-z0-9/-]*$') and char_length(resource_url) <= 2048)),
  resource_storage_path text check (resource_storage_path is null or resource_storage_path ~ '^lessons/[0-9a-f-]{36}/resource/[a-z0-9._-]{1,120}$'),
  resource_label text check (resource_label is null or (resource_label = btrim(resource_label) and char_length(resource_label) <= 160)),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 600),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sequence integer not null default 100 check (sequence between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_lessons_one_video check (video_url is null or video_storage_path is null),
  constraint training_lessons_one_resource check (resource_url is null or resource_storage_path is null)
);
create index training_lessons_module_idx on public.training_lessons (module_id, sequence);

create table public.training_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  learner_type text not null check (learner_type in ('member', 'dependent')),
  learner_id uuid not null,
  lesson_id uuid not null references public.training_lessons(id) on delete restrict,
  progress_percentage integer not null default 0 check (progress_percentage between 0 and 100),
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (learner_type, learner_id, lesson_id),
  constraint training_lesson_progress_completion check (completed = (completed_at is not null))
);
create index training_lesson_progress_household_idx on public.training_lesson_progress (household_id, learner_type, learner_id);

create trigger training_courses_set_updated_at before update on public.training_courses for each row execute function private.set_updated_at();
create trigger training_modules_set_updated_at before update on public.training_modules for each row execute function private.set_updated_at();
create trigger training_lessons_set_updated_at before update on public.training_lessons for each row execute function private.set_updated_at();

alter table public.training_courses enable row level security;
alter table public.training_courses force row level security;
alter table public.training_modules enable row level security;
alter table public.training_modules force row level security;
alter table public.training_lessons enable row level security;
alter table public.training_lessons force row level security;
alter table public.training_lesson_progress enable row level security;
alter table public.training_lesson_progress force row level security;

create policy training_courses_read on public.training_courses for select to authenticated
  using (private.is_current_user_administrator() or (status = 'published' and private.has_training_access()));
create policy training_modules_read on public.training_modules for select to authenticated
  using (
    private.is_current_user_administrator()
    or (
      status = 'published' and private.has_training_access()
      and exists (select 1 from public.training_courses as course where course.id = course_id and course.status = 'published')
    )
  );
create policy training_lessons_read on public.training_lessons for select to authenticated
  using (
    private.is_current_user_administrator()
    or (
      status = 'published' and private.has_training_access()
      and exists (
        select 1 from public.training_modules as module
        join public.training_courses as course on course.id = module.course_id
        where module.id = module_id and module.status = 'published' and course.status = 'published'
      )
    )
  );
create policy training_lesson_progress_read on public.training_lesson_progress for select to authenticated
  using (private.is_active_household_member(household_id) or private.is_current_user_administrator());

revoke all on public.training_courses, public.training_modules, public.training_lessons, public.training_lesson_progress
  from public, anon, authenticated;
grant select on public.training_courses, public.training_modules, public.training_lessons, public.training_lesson_progress to authenticated;
grant select on public.training_lessons to service_role;

-- 4. Learner progress ------------------------------------------------------------

create or replace function public.record_lesson_progress(
  target_lesson_id uuid,
  input_learner_type text,
  input_progress_percentage integer,
  input_completed boolean,
  input_dependent_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household uuid := private.current_household_id();
  learner uuid;
  percentage integer := greatest(least(coalesce(input_progress_percentage, 0), 100), 0);
  is_complete boolean := coalesce(input_completed, false) or percentage = 100;
begin
  if target_household is null or not private.has_training_access() then
    raise exception 'An active RBT Boot Camp subscription is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.training_lessons as lesson
    join public.training_modules as module on module.id = lesson.module_id
    join public.training_courses as course on course.id = module.course_id
    where lesson.id = target_lesson_id and lesson.status = 'published'
      and module.status = 'published' and course.status = 'published'
  ) then
    raise exception 'Lesson is unavailable.' using errcode = '42501';
  end if;
  if input_learner_type = 'member' then
    learner := auth.uid();
  elsif input_learner_type = 'dependent' then
    if not exists (
      select 1 from public.dependents
      where id = input_dependent_id and household_id = target_household and archived_at is null
    ) then
      raise exception 'Choose a dependent from your household.' using errcode = '22023';
    end if;
    learner := input_dependent_id;
  else
    raise exception 'Invalid learner.' using errcode = '22023';
  end if;
  if is_complete then percentage := 100; end if;

  insert into public.training_lesson_progress (
    household_id, learner_type, learner_id, lesson_id, progress_percentage, completed, completed_at, updated_by
  ) values (
    target_household, input_learner_type, learner, target_lesson_id, percentage, is_complete,
    case when is_complete then now() end, auth.uid()
  )
  on conflict (learner_type, learner_id, lesson_id) do update
  set progress_percentage = greatest(public.training_lesson_progress.progress_percentage, excluded.progress_percentage),
      completed = public.training_lesson_progress.completed or excluded.completed,
      completed_at = coalesce(public.training_lesson_progress.completed_at, excluded.completed_at),
      updated_by = auth.uid(),
      updated_at = now();
end;
$$;

create or replace function public.reset_lesson_progress(target_lesson_id uuid, input_learner_type text, input_dependent_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_household uuid := private.current_household_id();
begin
  if target_household is null or not private.has_training_access() then
    raise exception 'An active RBT Boot Camp subscription is required.' using errcode = '42501';
  end if;
  delete from public.training_lesson_progress
  where lesson_id = target_lesson_id
    and household_id = target_household
    and learner_type = input_learner_type
    and learner_id = case when input_learner_type = 'member' then auth.uid() else input_dependent_id end;
end;
$$;

-- Course outline with per-learner progress for the current household.
create or replace function public.get_training_outline(input_learner_type text default 'member', input_dependent_id uuid default null)
returns table (
  course_id uuid,
  course_slug text,
  course_title text,
  course_description text,
  course_localized jsonb,
  module_id uuid,
  module_title text,
  module_description text,
  module_localized jsonb,
  module_sequence integer,
  lesson_id uuid,
  lesson_title text,
  lesson_description text,
  lesson_localized jsonb,
  lesson_sequence integer,
  duration_minutes integer,
  has_video boolean,
  has_resource boolean,
  progress_percentage integer,
  completed boolean,
  started_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select course.id, course.slug, course.title, course.description, course.localized,
    module.id, module.title, module.description, module.localized, module.sequence,
    lesson.id, lesson.title, lesson.description, lesson.localized, lesson.sequence,
    lesson.duration_minutes,
    lesson.video_url is not null or lesson.video_storage_path is not null,
    lesson.resource_url is not null or lesson.resource_storage_path is not null,
    coalesce(progress.progress_percentage, 0), coalesce(progress.completed, false),
    progress.started_at, progress.completed_at
  from public.training_courses as course
  join public.training_modules as module on module.course_id = course.id and module.status = 'published'
  join public.training_lessons as lesson on lesson.module_id = module.id and lesson.status = 'published'
  left join public.training_lesson_progress as progress
    on progress.lesson_id = lesson.id
   and progress.household_id = private.current_household_id()
   and progress.learner_type = coalesce(input_learner_type, 'member')
   and progress.learner_id = case when coalesce(input_learner_type, 'member') = 'member' then auth.uid() else input_dependent_id end
  where course.status = 'published'
    and private.has_training_access()
  order by course.sequence, course.title, module.sequence, module.title, lesson.sequence, lesson.title;
$$;

-- Household summary for the dashboard: one row per learner.
create or replace function public.get_training_progress_summary()
returns table (
  learner_type text,
  learner_id uuid,
  learner_name text,
  completed_lessons bigint,
  total_lessons bigint,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with published as (
    select lesson.id from public.training_lessons as lesson
    join public.training_modules as module on module.id = lesson.module_id and module.status = 'published'
    join public.training_courses as course on course.id = module.course_id and course.status = 'published'
    where lesson.status = 'published'
  ), learners as (
    select 'member'::text as learner_type, auth.uid() as learner_id, private.display_name(auth.uid()) as learner_name
    union all
    select 'dependent', dependent.id, coalesce(nullif(btrim(concat_ws(' ', dependent.first_name, dependent.last_name)), ''), 'Dependent')
    from public.dependents as dependent
    where dependent.household_id = private.current_household_id() and dependent.archived_at is null
  )
  select learners.learner_type, learners.learner_id, learners.learner_name,
    (select count(*) from public.training_lesson_progress as progress
      where progress.learner_type = learners.learner_type and progress.learner_id = learners.learner_id
        and progress.household_id = private.current_household_id()
        and progress.completed and progress.lesson_id in (select id from published)),
    (select count(*) from published),
    (select max(progress.updated_at) from public.training_lesson_progress as progress
      where progress.learner_type = learners.learner_type and progress.learner_id = learners.learner_id
        and progress.household_id = private.current_household_id())
  from learners
  where private.current_household_id() is not null;
$$;

-- 5. Administrator content management ------------------------------------------

create or replace function public.admin_save_training_course(
  input_slug text,
  input_title text,
  input_status text,
  input_description text default null,
  input_localized jsonb default null,
  target_course_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := private.require_administrator(); saved_id uuid;
begin
  if target_course_id is null then
    insert into public.training_courses (slug, title, description, localized, status, created_by, sequence)
    values (lower(btrim(input_slug)), btrim(input_title), nullif(btrim(coalesce(input_description, '')), ''),
      coalesce(input_localized, '{}'::jsonb), coalesce(input_status, 'draft'), actor,
      coalesce((select max(sequence) + 10 from public.training_courses), 10))
    returning id into saved_id;
  else
    update public.training_courses
    set slug = lower(btrim(input_slug)), title = btrim(input_title),
        description = nullif(btrim(coalesce(input_description, '')), ''),
        localized = coalesce(input_localized, '{}'::jsonb), status = coalesce(input_status, status)
    where id = target_course_id
    returning id into saved_id;
  end if;
  if saved_id is null then
    raise exception 'Course is unavailable.' using errcode = '42501';
  end if;
  return saved_id;
end;
$$;

create or replace function public.admin_save_training_module(
  target_course_id uuid,
  input_title text,
  input_status text,
  input_description text default null,
  input_localized jsonb default null,
  target_module_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare saved_id uuid;
begin
  perform private.require_administrator();
  if target_module_id is null then
    insert into public.training_modules (course_id, title, description, localized, status, sequence)
    values (target_course_id, btrim(input_title), nullif(btrim(coalesce(input_description, '')), ''),
      coalesce(input_localized, '{}'::jsonb), coalesce(input_status, 'draft'),
      coalesce((select max(sequence) + 10 from public.training_modules where course_id = target_course_id), 10))
    returning id into saved_id;
  else
    update public.training_modules
    set title = btrim(input_title), description = nullif(btrim(coalesce(input_description, '')), ''),
        localized = coalesce(input_localized, '{}'::jsonb), status = coalesce(input_status, status)
    where id = target_module_id
    returning id into saved_id;
  end if;
  if saved_id is null then
    raise exception 'Module is unavailable.' using errcode = '42501';
  end if;
  return saved_id;
end;
$$;

create or replace function public.admin_save_training_lesson(
  target_module_id uuid,
  input_title text,
  input_status text,
  input_description text default null,
  input_body text default null,
  input_localized jsonb default null,
  input_video_url text default null,
  input_resource_url text default null,
  input_resource_label text default null,
  input_duration_minutes integer default null,
  target_lesson_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare saved_id uuid;
begin
  perform private.require_administrator();
  if target_lesson_id is null then
    insert into public.training_lessons (
      module_id, title, description, body, localized, video_url, resource_url, resource_label,
      duration_minutes, status, sequence
    ) values (
      target_module_id, btrim(input_title), nullif(btrim(coalesce(input_description, '')), ''),
      nullif(btrim(coalesce(input_body, '')), ''), coalesce(input_localized, '{}'::jsonb),
      nullif(btrim(coalesce(input_video_url, '')), ''), nullif(btrim(coalesce(input_resource_url, '')), ''),
      nullif(btrim(coalesce(input_resource_label, '')), ''), input_duration_minutes, coalesce(input_status, 'draft'),
      coalesce((select max(sequence) + 10 from public.training_lessons where module_id = target_module_id), 10)
    ) returning id into saved_id;
  else
    update public.training_lessons
    set title = btrim(input_title), description = nullif(btrim(coalesce(input_description, '')), ''),
        body = nullif(btrim(coalesce(input_body, '')), ''), localized = coalesce(input_localized, '{}'::jsonb),
        video_url = nullif(btrim(coalesce(input_video_url, '')), ''),
        video_storage_path = case when nullif(btrim(coalesce(input_video_url, '')), '') is not null then null else video_storage_path end,
        resource_url = nullif(btrim(coalesce(input_resource_url, '')), ''),
        resource_storage_path = case when nullif(btrim(coalesce(input_resource_url, '')), '') is not null then null else resource_storage_path end,
        resource_label = nullif(btrim(coalesce(input_resource_label, '')), ''),
        duration_minutes = input_duration_minutes, status = coalesce(input_status, status)
    where id = target_lesson_id
    returning id into saved_id;
  end if;
  if saved_id is null then
    raise exception 'Lesson is unavailable.' using errcode = '42501';
  end if;
  return saved_id;
end;
$$;

-- Records a completed private upload for a lesson. The object path is derived here.
create or replace function public.admin_attach_training_media(
  target_lesson_id uuid,
  input_media_kind text,
  input_filename text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_name text := trim(both '-' from regexp_replace(lower(coalesce(input_filename, '')), '[^a-z0-9.]+', '-', 'g'));
  object_path text;
begin
  perform private.require_administrator();
  if input_media_kind not in ('video', 'resource') or safe_name !~ '^[a-z0-9][a-z0-9._-]{0,118}\.(mp4|webm|m4v|pdf|docx|pptx|txt)$' then
    raise exception 'Unsupported training media file.' using errcode = '22023';
  end if;
  if (input_media_kind = 'video' and safe_name !~ '\.(mp4|webm|m4v)$')
    or (input_media_kind = 'resource' and safe_name !~ '\.(pdf|docx|pptx|txt)$') then
    raise exception 'Unsupported training media file.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.training_lessons where id = target_lesson_id) then
    raise exception 'Lesson is unavailable.' using errcode = '42501';
  end if;
  object_path := 'lessons/' || target_lesson_id::text || '/' || input_media_kind || '/' || safe_name;
  if input_media_kind = 'video' then
    update public.training_lessons set video_storage_path = object_path, video_url = null where id = target_lesson_id;
  else
    update public.training_lessons set resource_storage_path = object_path, resource_url = null where id = target_lesson_id;
  end if;
  return object_path;
end;
$$;

create or replace function public.admin_set_training_status(input_entity text, target_id uuid, input_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator();
  if input_status not in ('draft', 'published', 'archived') then
    raise exception 'Invalid status.' using errcode = '22023';
  end if;
  if input_entity = 'course' then
    update public.training_courses set status = input_status where id = target_id;
  elsif input_entity = 'module' then
    update public.training_modules set status = input_status where id = target_id;
  elsif input_entity = 'lesson' then
    update public.training_lessons set status = input_status where id = target_id;
  else
    raise exception 'Invalid content type.' using errcode = '22023';
  end if;
  if not found then
    raise exception 'Content is unavailable.' using errcode = '42501';
  end if;
end;
$$;

-- Swap sequence with the neighbouring item in the same parent.
create or replace function public.admin_move_training_item(input_entity text, target_id uuid, input_direction text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_sequence integer;
  parent uuid;
  neighbour_id uuid;
  neighbour_sequence integer;
begin
  perform private.require_administrator();
  if input_direction not in ('up', 'down') then
    raise exception 'Invalid direction.' using errcode = '22023';
  end if;
  if input_entity = 'module' then
    select sequence, course_id into current_sequence, parent from public.training_modules where id = target_id for update;
    select id, sequence into neighbour_id, neighbour_sequence from public.training_modules
    where course_id = parent and id <> target_id
      and ((input_direction = 'up' and sequence <= current_sequence) or (input_direction = 'down' and sequence >= current_sequence))
    order by case when input_direction = 'up' then -sequence else sequence end, id
    limit 1 for update;
    if neighbour_id is null then return; end if;
    if neighbour_sequence = current_sequence then
      neighbour_sequence := current_sequence + case when input_direction = 'up' then -1 else 1 end;
    end if;
    update public.training_modules set sequence = neighbour_sequence where id = target_id;
    update public.training_modules set sequence = current_sequence where id = neighbour_id;
  elsif input_entity = 'lesson' then
    select sequence, module_id into current_sequence, parent from public.training_lessons where id = target_id for update;
    select id, sequence into neighbour_id, neighbour_sequence from public.training_lessons
    where module_id = parent and id <> target_id
      and ((input_direction = 'up' and sequence <= current_sequence) or (input_direction = 'down' and sequence >= current_sequence))
    order by case when input_direction = 'up' then -sequence else sequence end, id
    limit 1 for update;
    if neighbour_id is null then return; end if;
    if neighbour_sequence = current_sequence then
      neighbour_sequence := current_sequence + case when input_direction = 'up' then -1 else 1 end;
    end if;
    update public.training_lessons set sequence = neighbour_sequence where id = target_id;
    update public.training_lessons set sequence = current_sequence where id = neighbour_id;
  elsif input_entity = 'course' then
    select sequence into current_sequence from public.training_courses where id = target_id for update;
    select id, sequence into neighbour_id, neighbour_sequence from public.training_courses
    where id <> target_id
      and ((input_direction = 'up' and sequence <= current_sequence) or (input_direction = 'down' and sequence >= current_sequence))
    order by case when input_direction = 'up' then -sequence else sequence end, id
    limit 1 for update;
    if neighbour_id is null then return; end if;
    if neighbour_sequence = current_sequence then
      neighbour_sequence := current_sequence + case when input_direction = 'up' then -1 else 1 end;
    end if;
    update public.training_courses set sequence = neighbour_sequence where id = target_id;
    update public.training_courses set sequence = current_sequence where id = neighbour_id;
  else
    raise exception 'Invalid content type.' using errcode = '22023';
  end if;
end;
$$;

-- 6. Private training media ------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-media', 'training-media', false, 524288000,
  array[
    'video/mp4', 'video/webm', 'video/x-m4v', 'application/pdf', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_read_training_media(target_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_current_user_administrator() or (
    private.has_training_access() and exists (
      select 1 from public.training_lessons as lesson
      join public.training_modules as module on module.id = lesson.module_id and module.status = 'published'
      join public.training_courses as course on course.id = module.course_id and course.status = 'published'
      where lesson.status = 'published'
        and (lesson.video_storage_path = target_name or lesson.resource_storage_path = target_name)
    )
  );
$$;

drop policy if exists training_media_read on storage.objects;
create policy training_media_read on storage.objects for select to authenticated
  using (bucket_id = 'training-media' and private.can_read_training_media(name));
drop policy if exists training_media_admin_insert on storage.objects;
create policy training_media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'training-media' and private.is_current_user_administrator() and name ~ '^lessons/[0-9a-f-]{36}/(video|resource)/');
drop policy if exists training_media_admin_update on storage.objects;
create policy training_media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'training-media' and private.is_current_user_administrator());

-- 7. Seed the launch course shell with the existing reviewed study guide ------

do $$
declare course uuid; foundations uuid; procedures uuid;
begin
  insert into public.training_courses (slug, title, description, localized, status, sequence)
  values (
    'rbt-boot-camp', 'RBT Boot Camp',
    'A self-paced parent curriculum: understand neurodivergency, learn core behavior-analytic teaching procedures, and prepare for an external RBT-related credential or exam. Completing this course is not an RBT certification.',
    '{"am": {"title": "የRBT ቡት ካምፕ"}, "es": {"title": "Campamento RBT"}}'::jsonb,
    'published', 10
  ) returning id into course;
  insert into public.training_modules (course_id, title, description, localized, status, sequence)
  values (course, 'Understanding neurodivergency', 'Foundations for parents and caregivers.',
    '{"am": {"title": "ኒውሮዳይቨርጀንሲን መረዳት"}, "es": {"title": "Comprender la neurodivergencia"}}'::jsonb, 'published', 10)
  returning id into foundations;
  insert into public.training_modules (course_id, title, description, localized, status, sequence)
  values (course, 'Teaching procedures', 'Core procedures used in RBT-supervised teaching.',
    '{"am": {"title": "የማስተማሪያ ሂደቶች"}, "es": {"title": "Procedimientos de enseñanza"}}'::jsonb, 'published', 20)
  returning id into procedures;
  insert into public.training_lessons (module_id, title, description, resource_url, resource_label, status, sequence)
  values (
    procedures, 'Errorless teaching and intensive teaching',
    'A bilingual English–Amharic study guide covering the procedure, error correction, setup, flashcards, glossary, and key takeaways.',
    '/training/rbt', 'Open the bilingual study guide', 'published', 10
  );
  -- Foundations lessons are added by administrators once reviewed videos are available.
  perform foundations;
end $$;

-- 8. Grants --------------------------------------------------------------------

revoke all on function private.has_training_access() from public, anon;
revoke all on function private.can_read_training_media(text) from public, anon;
grant execute on function private.has_training_access() to authenticated;
grant execute on function private.can_read_training_media(text) to authenticated;

revoke all on function public.get_training_access() from public, anon;
revoke all on function public.record_lesson_progress(uuid, text, integer, boolean, uuid) from public, anon;
revoke all on function public.reset_lesson_progress(uuid, text, uuid) from public, anon;
revoke all on function public.get_training_outline(text, uuid) from public, anon;
revoke all on function public.get_training_progress_summary() from public, anon;
revoke all on function public.admin_save_training_course(text, text, text, text, jsonb, uuid) from public, anon;
revoke all on function public.admin_save_training_module(uuid, text, text, text, jsonb, uuid) from public, anon;
revoke all on function public.admin_save_training_lesson(uuid, text, text, text, text, jsonb, text, text, text, integer, uuid) from public, anon;
revoke all on function public.admin_attach_training_media(uuid, text, text) from public, anon;
revoke all on function public.admin_set_training_status(text, uuid, text) from public, anon;
revoke all on function public.admin_move_training_item(text, uuid, text) from public, anon;
grant execute on function public.get_training_access() to authenticated;
grant execute on function public.record_lesson_progress(uuid, text, integer, boolean, uuid) to authenticated;
grant execute on function public.reset_lesson_progress(uuid, text, uuid) to authenticated;
grant execute on function public.get_training_outline(text, uuid) to authenticated;
grant execute on function public.get_training_progress_summary() to authenticated;
grant execute on function public.admin_save_training_course(text, text, text, text, jsonb, uuid) to authenticated;
grant execute on function public.admin_save_training_module(uuid, text, text, text, jsonb, uuid) to authenticated;
grant execute on function public.admin_save_training_lesson(uuid, text, text, text, text, jsonb, text, text, text, integer, uuid) to authenticated;
grant execute on function public.admin_attach_training_media(uuid, text, text) to authenticated;
grant execute on function public.admin_set_training_status(text, uuid, text) to authenticated;
grant execute on function public.admin_move_training_item(text, uuid, text) to authenticated;
