-- User-owned educational-review progress for the RBT study resource. This is
-- intentionally unrelated to households, dependents, credentials, or scores.
create table public.training_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_key text not null check (course_key = 'rbt-errorless-teaching-intensive-teaching'),
  completed_sections text[] not null default '{}'::text[],
  last_section text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint training_progress_user_course_key unique (user_id, course_key)
);

create or replace function private.normalize_training_progress()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_sections text[] := '{}'::text[];
  section_value text;
  allowed_sections constant text[] := array['overview', 'procedure', 'errors', 'setup', 'flashcards', 'glossary', 'takeaways'];
begin
  new.completed_sections := coalesce(new.completed_sections, '{}'::text[]);

  foreach section_value in array new.completed_sections loop
    if not (section_value = any(allowed_sections)) then
      raise exception 'Invalid training section.' using errcode = '22023';
    end if;
    if not (section_value = any(normalized_sections)) then
      normalized_sections := array_append(normalized_sections, section_value);
    end if;
  end loop;

  if new.last_section is not null and not (new.last_section = any(allowed_sections)) then
    raise exception 'Invalid training section.' using errcode = '22023';
  end if;

  new.completed_sections := normalized_sections;
  if cardinality(normalized_sections) = cardinality(allowed_sections) then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger training_progress_normalize
  before insert or update on public.training_progress
  for each row execute function private.normalize_training_progress();

create trigger training_progress_set_updated_at
  before update on public.training_progress
  for each row execute function private.set_updated_at();

alter table public.training_progress enable row level security;
alter table public.training_progress force row level security;

revoke all on table public.training_progress from public, anon;
grant select, insert, update on table public.training_progress to authenticated;

create policy training_progress_select_own
  on public.training_progress for select to authenticated
  using ((select auth.uid()) = user_id);

create policy training_progress_insert_own
  on public.training_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy training_progress_update_own
  on public.training_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.record_training_progress(target_section text, mark_completed boolean default false)
returns table(completed_sections text[], last_section text, completed_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_progress public.training_progress%rowtype;
  next_sections text[];
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if target_section not in ('overview', 'procedure', 'errors', 'setup', 'flashcards', 'glossary', 'takeaways') then
    raise exception 'Invalid training section.' using errcode = '22023';
  end if;

  select * into current_progress
  from public.training_progress
  where user_id = current_user_id
    and course_key = 'rbt-errorless-teaching-intensive-teaching'
  for update;

  if not found then
    insert into public.training_progress (user_id, course_key, completed_sections, last_section)
    values (
      current_user_id,
      'rbt-errorless-teaching-intensive-teaching',
      case when mark_completed then array[target_section] else '{}'::text[] end,
      target_section
    )
    returning training_progress.completed_sections, training_progress.last_section, training_progress.completed_at
    into completed_sections, last_section, completed_at;
  else
    next_sections := current_progress.completed_sections;
    if mark_completed and not (target_section = any(next_sections)) then
      next_sections := array_append(next_sections, target_section);
    end if;

    update public.training_progress
    set completed_sections = next_sections,
        last_section = target_section
    where id = current_progress.id
    returning training_progress.completed_sections, training_progress.last_section, training_progress.completed_at
    into completed_sections, last_section, completed_at;
  end if;

  return next;
end;
$$;

revoke all on function private.normalize_training_progress() from public;
revoke all on function public.record_training_progress(text, boolean) from public, anon;
grant execute on function public.record_training_progress(text, boolean) to authenticated;
