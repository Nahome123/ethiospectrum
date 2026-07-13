# Architecture

Next.js 16 App Router provides locale-prefixed public, auth, member, and admin route groups. `next-intl` routing is handled by `proxy.ts`; `/` redirects to `/en`. Reusable shells separate public marketing, member, and administrator experiences. `config/brand.ts` is the canonical branding source. Next.js route groups do not prevent path collisions, so the protected member resources placeholder is `/[locale]/member/resources`, while public resources remains `/[locale]/resources`.

Protected layouts use server-only guards that deny by default and redirect to localized login routes. Future Supabase session lookup replaces the intentionally-null foundation session without changing pages. PostgreSQL and RLS own data authorization; client state is never authorization.

## Supabase integration boundary

ETH-007 introduces a credential-safe utility layer without enabling authentication. `lib/env/client.ts` validates and exposes only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; it supports a fully absent configuration so the marketing application continues to build. `lib/env/server.ts` is server-only and validates the optional service-role key separately. A partial configuration is rejected and any utility invoked without its required configuration throws a clear development error.

`lib/supabase/browser.ts` is reserved for Client Components. `server.ts`, `route-handler.ts`, `server-action.ts`, and `middleware.ts` provide request-scoped SSR clients for their matching App Router boundary. They are not wired into the locale proxy or protected routes yet, so ETH-008 can make the authentication behavior explicit. `admin.ts` is server-only and bypasses RLS; it is limited to reviewed administrative or background operations. Future authorization must verify the user server-side and enforce access through PostgreSQL RLS, never through client state or a service-role client.

The database migration enables `pgcrypto` and `vector`. Apply it only in a reviewed Supabase environment; local development may use a credential-free marketing mode.
