-- New staff role: Parent Support. In its own migration so the new value is
-- committed before the next migration uses it.
alter type public.app_role add value if not exists 'parent_support';
