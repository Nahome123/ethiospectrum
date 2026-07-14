# Architecture

Next.js 16 App Router provides locale-prefixed public, auth, member, and admin route groups. `next-intl` routing is handled by `proxy.ts`; `/` redirects to `/en`. Reusable shells separate public marketing, member, and administrator experiences. `config/brand.ts` is the canonical branding source. Next.js route groups do not prevent path collisions, so the protected member resources placeholder is `/[locale]/member/resources`, while public resources remains `/[locale]/resources`.

Protected layouts use server-only guards that deny by default and redirect to localized login routes. Future Supabase session lookup replaces the intentionally-null foundation session without changing pages. PostgreSQL and RLS own data authorization; client state is never authorization.

## Supabase integration boundary

ETH-007 introduces a credential-safe utility layer. `lib/env/client.ts` validates and exposes only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; it supports a fully absent configuration so the marketing application continues to build. `lib/env/server.ts` is server-only and validates the optional secret key separately. A partial configuration is rejected and any utility invoked without its required configuration throws a clear development error.

`lib/supabase/browser.ts` is reserved for Client Components. `server.ts`, `route-handler.ts`, `server-action.ts`, and `middleware.ts` provide request-scoped SSR clients for their matching App Router boundary. Root `proxy.ts` preserves refreshed cookies while running locale routing. `admin.ts` is server-only and bypasses RLS; it is limited to reviewed administrative or background operations. Authorization verifies claims server-side and enforces access through PostgreSQL RLS, never through client state or an elevated client.

The database migration enables `pgcrypto` and `vector`. Apply it only in a reviewed Supabase environment; local development may use a credential-free marketing mode.

## ETH-008 authentication boundary

Email/password authentication uses Supabase SSR cookie sessions. Root `proxy.ts` runs locale routing and preserves Supabase cookie refreshes. Protected layouts verify identity with `auth.getClaims()` on the server; `auth.getUser()` is used only when fresh display metadata is needed. Member routes require a verified identity. Administrator routes require a trusted `app_metadata` administrator claim and default to denial when it is absent; user metadata is never authorization data.

The browser client sees only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `SUPABASE_SECRET_KEY` remains in the server-only administrative client and is not used for ordinary authentication. Authentication actions use locale-aware, validated internal redirects; the PKCE confirmation callback is deliberately outside the locale route group at `/auth/confirm`.
