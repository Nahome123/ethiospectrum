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

ETH-011 adds locale-prefixed dependent routes under `/[locale]/dependents`. Server Components obtain the verified session and active household through the normal request-scoped Supabase client. Server Actions validate only allowed dependent fields, derive the household and actor on the server, and rely on database RLS for the write. They do not import the elevated client or accept a household ID, owner ID, permission, role, or creator from the browser. Owners and household administrators may create, update, and archive; active members and viewers can read active profiles. The dashboard and member shell link to the dependent area but do not persist a navigation preference.

ETH-012 adds protected document routes at `/[locale]/documents`, `/[locale]/documents/upload`, and `/[locale]/documents/[documentId]`, plus the authenticated download route at `/api/documents/[documentId]/download`. The upload page server-loads only active dependents from the verified household and never receives a household ID, actor ID, document ID, or object path from the browser.

The upload lifecycle is deliberately split so a document body does not pass through a Server Action: a user-scoped prepare action validates metadata, creates a pending document row, and returns only the document ID, trusted object path, and a Supabase signed-upload token. The browser uploads directly to the private bucket with `uploadToSignedUrl`, then calls a completion action. Completion checks the expected object metadata under the requesting user's Storage policies before it marks the row uploaded and revalidates the document and dashboard routes. Failed preparation or upload is represented as `failed`, never as a successful upload. Supabase upload tokens are bearer capabilities with a provider-set two-hour lifetime and are not individually revocable; revocation or archive after issuance can at most leave an uncompletable orphan object at the one trusted path. Pending rows and orphan objects require a future scheduled cleanup workflow.

ETH-013 makes `/[locale]/documents` a Server Component binder backed by `lib/documents/binder-query.ts`. A neutral Zod URL-state module normalizes a bounded metadata query, UUID-dependent selection, household-level sentinel, category/MIME/lifecycle/processing filters, strict dates, controlled sort option, and page number before the server-only query runs. The query derives the household and permission from `getDocumentContext`, always scopes `documents` with that verified household, excludes `deleted_at` records by default, selects only card/detail metadata, applies a fixed PostgREST metadata-search expression built from normalized word tokens, maps sort values to fixed columns plus `id`, and fetches only 12 rows per page. It batch-resolves dependent display names without relaxing RLS: archived or inaccessible dependent names fall back to a neutral label rather than exposing a profile. Dashboard document summaries use the same server-side context and active uploaded-row rules.

The binder's URL state is shareable and locale-preserving, but it never carries a household identifier or arbitrary database column. Native GET forms provide the initial search/filter results; a client-only Base UI sheet enhances the mobile filter experience. The detail page remains a safe same-result route for missing or unauthorized IDs, shows only metadata and a generic uploader label, and returns to the binder. Archive remains a soft database state transition: default results omit it, objects remain private, and explicit archive filtering remains subject to existing RLS. ETH-013 deliberately adds no OCR, parsing, content extraction/search, AI, public sharing, background worker, or deletion workflow.

The download route validates the UUID, authenticated session, active household, and active uploaded document through RLS before creating a 60-second signed URL and redirecting to it. It uses the same safe response for a missing or inaccessible document. The browser never receives a public URL, storage secret, unrelated row data, or an administrative client. The member-facing actions module has a top-level `"use server"` directive and exports only async functions; state, schemas, constants, and synchronous helpers live in neutral modules so Next.js Server Actions remain valid.

The `family-documents` bucket is private and migration-defined. Its trusted object paths have this shape:

```text
households/{householdId}/dependents/{dependentId|unassigned}/documents/{documentId}/{safeFilename}
```

The database trigger, rather than the browser, creates the document UUID, normalizes the filename, and generates the final path. Storage policies require an exact pending or uploaded document record that matches the complete generated path, not merely a user-supplied folder prefix.

The confirmation callback exchanges a PKCE code or verifies an approved token-hash type, then redirects only to a validated locale route. Successful password-recovery callbacks also set a short-lived, HTTP-only, locale-scoped recovery-intent cookie. The reset page and password-update action require both that intent and a verified Supabase session; the intent is cleared after a successful password update.

The browser client sees only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `SUPABASE_SECRET_KEY` remains in the server-only administrative client and is not used for ordinary authentication. Authentication actions use locale-aware, validated internal redirects; the PKCE confirmation callback is deliberately outside the locale route group at `/auth/confirm`.
