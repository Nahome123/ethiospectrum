-- ETH-011: household-scoped dependent profiles with least-privilege access.

alter table public.dependents add column if not exists created_by uuid;
alter table public.dependents add column if not exists archived_at timestamptz;
update public.dependents as dependent
set created_by = household.primary_owner_id
from public.households as household
where household.id = dependent.household_id and dependent.created_by is null;
alter table public.dependents alter column created_by set not null;
alter table public.dependents
  add constraint dependents_created_by_fkey foreign key (created_by) references auth.users(id);

alter table public.dependents
  add constraint dependents_first_name_valid check (first_name = btrim(first_name) and char_length(first_name) between 1 and 80),
  add constraint dependents_last_name_valid check (last_name is null or (last_name = btrim(last_name) and char_length(last_name) <= 80)),
  add constraint dependents_preferred_name_valid check (preferred_name is null or (preferred_name = btrim(preferred_name) and char_length(preferred_name) <= 80)),
  add constraint dependents_school_district_valid check (school_district is null or (school_district = btrim(school_district) and char_length(school_district) <= 160)),
  add constraint dependents_grade_level_valid check (grade_level is null or (grade_level = btrim(grade_level) and char_length(grade_level) <= 80)),
  add constraint dependents_notes_valid check (notes is null or (notes = btrim(notes) and char_length(notes) <= 2000));

create index if not exists dependents_household_active_idx on public.dependents(household_id, created_at desc) where archived_at is null;

create or replace function private.normalize_dependent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.first_name = btrim(coalesce(new.first_name, ''));
  new.last_name = nullif(btrim(new.last_name), '');
  new.preferred_name = nullif(btrim(new.preferred_name), '');
  new.school_district = nullif(btrim(new.school_district), '');
  new.grade_level = nullif(btrim(new.grade_level), '');
  new.notes = nullif(btrim(new.notes), '');
  if tg_op = 'INSERT' then
    new.created_by = auth.uid();
  elsif new.household_id is distinct from old.household_id or new.created_by is distinct from old.created_by then
    raise exception 'Dependent household and creator cannot be changed.' using errcode = '42501';
  elsif old.archived_at is not null then
    raise exception 'Archived dependents cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists dependents_normalize on public.dependents;
create trigger dependents_normalize before insert or update on public.dependents for each row execute function private.normalize_dependent();
drop trigger if exists dependents_set_updated_at on public.dependents;
create trigger dependents_set_updated_at before update on public.dependents for each row execute function private.set_updated_at();

alter table public.dependents enable row level security;
alter table public.dependents force row level security;
drop policy if exists dependents_access on public.dependents;
create policy dependents_select_active_members on public.dependents
  for select to authenticated
  using (
    (archived_at is null and private.is_active_household_member(household_id))
    or private.has_household_permission(household_id, array['owner', 'administrator']::public.household_permission[])
  );
create policy dependents_insert_owners_and_administrators on public.dependents for insert to authenticated with check (archived_at is null and created_by = auth.uid() and private.has_household_permission(household_id, array['owner', 'administrator']::public.household_permission[]));
create policy dependents_update_owners_and_administrators on public.dependents for update to authenticated using (archived_at is null and private.has_household_permission(household_id, array['owner', 'administrator']::public.household_permission[])) with check (private.has_household_permission(household_id, array['owner', 'administrator']::public.household_permission[]));

revoke all on table public.dependents from anon;
revoke all on table public.dependents from authenticated;
grant select, insert, update on table public.dependents to authenticated;
revoke all on function private.normalize_dependent() from public;
