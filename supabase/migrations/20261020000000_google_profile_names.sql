-- Sign in with Google: Google accounts carry given_name / family_name /
-- full_name rather than the first_name / last_name our sign-up form sends.
-- New profiles now fall back to those, so a person who joins with Google
-- (for example an invited caregiver, who skips household setup) shows by
-- name instead of "Household member".

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  profile_locale text := coalesce(nullif(btrim(metadata ->> 'preferred_locale'), ''), 'en');
  full_name text := regexp_replace(btrim(coalesce(nullif(btrim(metadata ->> 'full_name'), ''), metadata ->> 'name', '')), '\s+', ' ', 'g');
  first_part text := nullif(split_part(full_name, ' ', 1), '');
  rest_part text := nullif(btrim(substr(full_name, char_length(split_part(full_name, ' ', 1)) + 1)), '');
  profile_first text;
  profile_last text;
begin
  if profile_locale not in ('en', 'am', 'es') then
    profile_locale := 'en';
  end if;

  if nullif(btrim(metadata ->> 'first_name'), '') is not null then
    profile_first := btrim(metadata ->> 'first_name');
    profile_last := nullif(btrim(metadata ->> 'last_name'), '');
  elsif nullif(btrim(metadata ->> 'given_name'), '') is not null then
    profile_first := btrim(metadata ->> 'given_name');
    profile_last := nullif(btrim(metadata ->> 'family_name'), '');
  else
    profile_first := first_part;
    profile_last := rest_part;
  end if;

  insert into public.profiles (id, first_name, last_name, preferred_locale)
  values (
    new.id,
    nullif(btrim(left(profile_first, 80)), ''),
    nullif(btrim(left(profile_last, 80)), ''),
    profile_locale
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'member')
  on conflict (user_id) do nothing;

  return new;
end;
$$;
