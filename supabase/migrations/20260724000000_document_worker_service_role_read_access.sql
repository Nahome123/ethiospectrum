-- Background document workers use the server-side service-role client to
-- revalidate a parent document and read protected extraction derivatives.
-- Browser roles remain excluded; RLS policies stay enabled and forced.
grant select on table public.documents to service_role;
grant select on table public.document_pages to service_role;
grant select on table public.document_chunks to service_role;
grant select on table public.document_processing_jobs to service_role;
grant select on table public.document_summaries to service_role;
