# Architecture

Next.js 16 App Router provides locale-prefixed public, auth, member, and admin route groups. `next-intl` routing is handled by `proxy.ts`; `/` redirects to `/en`. Reusable shells separate public marketing, member, and administrator experiences. `config/brand.ts` is the canonical branding source. Next.js route groups do not prevent path collisions, so the protected member resources placeholder is `/[locale]/member/resources`, while public resources remains `/[locale]/resources`.

Protected layouts use server-only guards that deny by default and redirect to localized login routes. PostgreSQL and RLS own data authorization; client state is never authorization.

## Supabase integration boundary

ETH-007 introduces a credential-safe utility layer. `lib/env/client.ts` validates and exposes only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; it supports a fully absent configuration so the marketing application continues to build. `lib/env/server.ts` is server-only and validates the optional secret key separately. A partial configuration is rejected and any utility invoked without its required configuration throws a clear development error.

`lib/supabase/browser.ts` is reserved for Client Components. `server.ts`, `route-handler.ts`, `server-action.ts`, and `middleware.ts` provide request-scoped SSR clients for their matching App Router boundary. Root `proxy.ts` preserves refreshed cookies while running locale routing. `admin.ts` is server-only and bypasses RLS; it is limited to reviewed administrative or background operations. Authorization verifies claims server-side and enforces access through PostgreSQL RLS, never through client state or an elevated client.

The database migration enables `pgcrypto` and `vector`. Apply it only in a reviewed Supabase environment; local development may use a credential-free marketing mode.

## Authentication and household authorization boundary

Email/password authentication uses Supabase SSR cookie sessions. Root `proxy.ts` runs locale routing and preserves Supabase cookie refreshes while excluding the unlocalized `/auth/confirm` callback. Protected layouts verify identity with `auth.getClaims()` on the server. Member display data comes from `public.profiles`; Auth email is only a fallback. Administrator routes read the current user's RLS-protected `public.user_roles` row server-side and default to denial when it is absent or non-administrator. JWT and user metadata never authorize a role.

ETH-009 establishes the first application-data boundary. The `private` schema holds security-definer helpers with an empty fixed search path. `profiles`, `user_roles`, `households`, and `household_members` force RLS. The only normal-user household creation path is `public.create_household(name)`, which creates both the household and its active owner membership atomically. Other membership management, invitations, ownership transfer, and onboarding remain outside this boundary.

The confirmation callback exchanges a PKCE code or verifies an approved token-hash type, then redirects only to a validated locale route. Successful password-recovery callbacks also set a short-lived, HTTP-only, locale-scoped recovery-intent cookie. The reset page and password-update action require both that intent and a verified Supabase session; the intent is cleared after a successful password update.

The browser client sees only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `SUPABASE_SECRET_KEY` remains in the server-only administrative client and is not used for ordinary authentication. Authentication actions use locale-aware, validated internal redirects; the PKCE confirmation callback is deliberately outside the locale route group at `/auth/confirm`.
