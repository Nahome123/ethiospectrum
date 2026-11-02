-- Parent Support staff can take bookings through their own Calendly page.
-- While a link is set (and they are taking bookings), families book the free
-- session on Calendly instead of from the in-app weekly hours.

alter table public.specialists
  add column if not exists booking_page_url text;

alter table public.specialists
  add constraint specialists_booking_page_url_check check (
    booking_page_url is null
    or (booking_page_url ~ '^https://calendly\.com/[A-Za-z0-9_./?=&%-]+$' and char_length(booking_page_url) <= 500)
  );

-- The signed-in staff member's own Calendly link.
create function public.get_my_booking_page()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select specialist.booking_page_url
  from public.specialists as specialist
  where specialist.id = private.current_specialist_profile_id();
$$;

create function public.update_my_booking_page(input_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_specialist uuid := private.current_specialist_profile_id();
  link text := nullif(btrim(coalesce(input_url, '')), '');
begin
  if target_specialist is null then
    raise exception 'Only staff can set a booking page.' using errcode = '42501';
  end if;
  if link is not null
    and (link !~ '^https://calendly\.com/[A-Za-z0-9_./?=&%-]+$' or char_length(link) > 500) then
    raise exception 'Invalid booking page.' using errcode = '22023';
  end if;
  update public.specialists
  set booking_page_url = link, updated_at = now()
  where id = target_specialist;
end;
$$;

-- The Calendly page families use to book Parent Support, if any: the first
-- Parent Support provider taking bookings who has set one.
create function public.get_parent_support_booking_page()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select specialist.booking_page_url
  from public.specialists as specialist
  where specialist.booking_page_url is not null
    and specialist.availability_status = 'available'
    and exists (
      select 1 from public.specialist_capabilities as capability
      where capability.specialist_id = specialist.id and capability.service_type = 'parent_support'
    )
  order by specialist.created_at, specialist.id
  limit 1;
$$;

revoke all on function public.get_my_booking_page() from public, anon;
grant execute on function public.get_my_booking_page() to authenticated;
revoke all on function public.update_my_booking_page(text) from public, anon;
grant execute on function public.update_my_booking_page(text) to authenticated;
revoke all on function public.get_parent_support_booking_page() from public;
grant execute on function public.get_parent_support_booking_page() to anon, authenticated;
