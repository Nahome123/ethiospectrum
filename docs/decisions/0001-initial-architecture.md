# ADR 0001: Next.js locale-first foundation

Status: accepted. Ethiospectrum uses a single Next.js App Router application with next-intl locale-prefixed routes, server-first page rendering, and Supabase-ready security boundaries. This keeps public content fast while allowing server-side authorization later. The tradeoff is that protected placeholders are intentionally inaccessible until real authentication exists.
