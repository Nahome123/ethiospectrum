# Ethiospectrum

Ethiospectrum is a multilingual family-support platform foundation for organizing important information, understanding complex documents, tracking next steps, and finding educational resources in English, Amharic, and Spanish.

## Current status

Implemented: locale-prefixed public routes, responsive marketing UI, centralized branding, Supabase email/password authentication, profiles, isolated roles, households, household memberships, family onboarding, RLS-protected dependent profile management, private document upload/download/archive flows, a household-scoped digital document binder, controlled document processing, and source-grounded document summaries for eligible processed documents.

Planned: profile and household synchronization, document OCR, general-purpose AI answers, messaging, scheduling, billing, analytics, and monitoring. These integrations are not functional in this repository.

## Stack and architecture

Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn Luma, next-intl, Zod, React Hook Form, Vitest, Playwright, and axe. Public routes live in `app/[locale]/(marketing)`. `proxy.ts` supports `/en`, `/am`, and `/es`; `/` redirects to `/en`. Household and document data belongs in Supabase behind row-level security.

## Prerequisites and installation

Use Node.js 20+ and pnpm. Copy `.env.example` to `.env.local` if integration work needs values; the marketing foundation does not require credentials.

```bash
pnpm install
pnpm dev
```

## Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:a11y
pnpm format:check
pnpm build
pnpm db:start
pnpm db:reset
pnpm db:test
pnpm db:lint
pnpm db:types
```

## Supabase and migrations

Do not point local work at production data. The public marketing app intentionally runs without Supabase credentials. For local integration work only, start a local Supabase project with the Supabase CLI, then copy its API URL, publishable key, and secret key into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local-publishable-key>
SUPABASE_SECRET_KEY=<local-secret-key>
```

Apply `supabase/migrations/` only through the local Supabase CLI or a reviewed migration workflow, then validate the RLS matrix in `supabase/policies/README.md`. The publishable key is a public client credential constrained by RLS; the secret key bypasses RLS and must remain server-only. Never prefix it with `NEXT_PUBLIC_`, add it to a browser bundle, commit `.env.local`, or use it for ordinary user requests.

ETH-009 owns `profiles`, `user_roles`, `households`, and `household_members`. The Auth trigger creates a profile and a default `member` role for every new Auth user; it ignores role metadata. Household creation is available only through `public.create_household(name)`, which atomically adds the active owner membership. Run `pnpm db:types` after local migrations to refresh `lib/supabase/database.types.ts`. Never run `pnpm db:push` without a reviewed migration and explicit approval.

ETH-011 adds active dependent profiles at `/[locale]/dependents`. Owners and household administrators may create, edit, and archive them; active members and viewers can read active profiles only. Archiving is irreversible in the current UI: active lists and direct profile routes exclude archived profiles, while owners and administrators retain database visibility needed to complete the authorized archive transition. The server action derives both household and actor from the verified session; it never accepts either value from a browser form.

ETH-012 creates the private `family-documents` Storage bucket through a migration. It accepts PDF, DOCX, and TXT uploads up to 20 MiB. The prepare action derives the active household and actor, validates metadata, creates a pending `documents` row, and receives a Supabase time-limited signed upload token (currently valid for two hours). The browser uploads directly with that token and then calls the completion action; the server checks the expected private object metadata before marking the row uploaded. Object paths are generated from trusted values only:

```text
households/{householdId}/dependents/{dependentId|unassigned}/documents/{documentId}/{safeFilename}
```

The bucket is never public and the application never calls `getPublicUrl`. Authenticated active household members may read uploaded document metadata and download their household's uploaded documents. Owners, household administrators, and members may upload; viewers and removed members may not. Owners, administrators, or the original uploader while still an active non-viewer may archive a document. Archive keeps the physical object for a future retention workflow and removes it from the active list. A previously issued upload token is a bounded bearer capability and cannot be individually revoked: after membership removal or archive it may still place an orphan object at its one generated path until it expires, but it cannot complete or be read through the app. Scheduled orphan cleanup is a future operational task.

The migration marks any pre-ETH-012, non-archived document row without upload lifecycle metadata as `failed` rather than trusting an unverified legacy path. Before a hosted rollout, inventory any such records and plan a reviewed re-upload or data migration; do not rely on an automatic conversion.

ETH-013 turns `/[locale]/documents` into a URL-driven document binder. It derives the current household on the server, validates every search/filter/sort/page value, searches only safe metadata (title, normalized filename, and category), filters by active dependent or household-level assignment, category, MIME type, lifecycle/processing status, and created-date range, and returns 12 rows per server-side page. Sorting is restricted to newest, oldest, or title order with a deterministic ID tiebreaker. The default binder excludes soft-archived rows; an explicit archive-status filter can show only records the caller's existing RLS policy permits. It does not search document content, call a public Storage URL, use the administrative client, or alter private object retention. Native Amharic and Spanish review remains required before release.

ETH-014 adds an opt-in, server-only processing foundation for active uploaded PDF, DOCX, and TXT records. An authorized non-viewer can queue work, while a separate internal scheduler route with a distinct server-only secret runs a small service-role batch. The worker claims jobs atomically, revalidates the private object path/metadata, extracts bounded text, and persists only authorized page/chunk derivatives through protected database functions. Browser sessions cannot write jobs or derivatives, and the member UI shows only safe processing status, attempt, retry-eligibility, and timestamp details rather than document text. This issue does not add OCR, embeddings, AI analysis, content search, public sharing, or permanent deletion. Review [the document-processing runbook](docs/document-processing-design.md) before configuring a scheduler.

ETH-015 adds a separate, opt-in summary lifecycle for only active, uploaded documents whose processing has completed and whose protected extraction exists. A summary is language-specific (`en`, `am`, or `es`), may reuse a completed result, and has the safe lifecycle `queued`, `generating`, `completed`, or `failed`. Active owners, household administrators, and members may request or retry a summary; active viewers may read an existing accessible summary but cannot create AI work. Anonymous users, removed members, unrelated households, archived documents, and documents that still need processing or OCR are denied.

Summaries are structured, source-grounded aids rather than professional conclusions. The worker accepts document text only from trusted server-side pages and chunks, treats it as untrusted data rather than instructions, and stores only validated structured output, safe model/provider identifiers, and bounded source references. It never stores API keys, signed URLs, raw prompts, raw provider responses, or document content in logs. Long documents use a bounded deterministic strategy and indicate when only a subset could be summarized. Users must verify important statements against the original document; summaries may contain errors and do not replace legal, medical, educational, financial, or other professional advice.

The initial provider boundary is server-only OpenAI configuration. `OPENAI_API_KEY`, `OPENAI_SUMMARY_MODEL`, and the distinct `DOCUMENT_SUMMARY_SECRET` belong only in server-side environments and must never be prefixed with `NEXT_PUBLIC_`. `DOCUMENT_SUMMARY_SECRET` must not reuse `SUPABASE_SECRET_KEY` or `DOCUMENT_PROCESSING_SECRET`. ETH-015 does not add OCR, document chat, embeddings, vector search, cross-document search, public sharing, tool calls, autonomous actions, or live browsing.

ETH-016 adds a separate OCR fallback for active, uploaded scanned PDFs whose normal extraction reached `needs_ocr`. An active owner, household administrator, or member may request a bounded OCR job; viewers, removed members, unrelated households, archived records, incomplete uploads, non-PDFs, and already-completed documents are denied by the server and database. A protected worker renders bounded page images in memory, sends them only through the configured server-only provider boundary, normalizes Unicode without translating it, and atomically replaces page/chunk derivatives. Only usable stored output transitions `needs_ocr` to `completed`; an OCR failure or empty result remains `needs_ocr` and is retryable within the configured limit. OCR may contain errors, so users must verify text against the original PDF. It adds no document-content search, embeddings, vector retrieval, document Q&A, chat, public sharing, or professional conclusions.

For a local manual check, run the local Supabase stack and reset the database, sign in with synthetic users, complete household onboarding, and upload small synthetic PDF, DOCX, and TXT files with several titles, categories, and one active dependent. Confirm that the binder's metadata search, each filter, controlled sort, clear action, date range, pagination, mobile filter dialog, detail back link, dashboard links/counts, and 60-second signed download work for the current household only. Archive a record and confirm it disappears from the default binder, remains visible only through the archive-status filter when RLS allows it, and leaves its private object intact. Also verify empty, unsupported, and over-20-MiB file behavior. Do not use real personal documents or hosted production data for these checks.

For a local ETH-015 check, use only synthetic processed documents and a mocked provider response. Confirm that owner, administrator, and member accounts can request an eligible language-specific summary; a viewer can read an existing summary but has no generation control; a removed member and another household cannot read or request it; queued/generating/failed/completed states are honest; source references identify real pages or logical sections; and a bounded source preview is keyboard accessible. Verify English, Amharic, and Spanish UI separately, treat Amharic and Spanish output as requiring native review, and do not enter a real API key or sensitive document into automated tests.

For local-only administrator testing, use a direct SQL console against the local database after creating a synthetic user: `update public.user_roles set role = 'administrator' where user_id = '<synthetic UUID>';`. Do not run this against a hosted project without a reviewed role-governance procedure.

`lib/supabase/browser.ts` is the only browser client entry point. Server Component, route-handler, server-action, proxy, and admin utilities are separate modules. They throw a clear development configuration error when invoked without the required local values; they do not create a placeholder session or fake user.

## Supabase Auth setup

Enable Email/Password authentication and require email confirmation in the Supabase Dashboard. In Authentication URL Configuration, add the local callback pattern `http://localhost:3000/**` (replace the port when needed), the production callback `https://<your-domain>/auth/confirm`, and the Vercel preview pattern `https://*.vercel.app/auth/confirm` if previews are enabled. Set the Site URL to the canonical production origin before production launch.

ETH-008 uses a cookie-based PKCE flow. In the Supabase **Confirm signup** and **Reset password** email templates, keep the confirmation link pointed at Supabase's generated URL. It preserves the application's safe `redirectTo` callback and the one-time confirmation data:

```text
{{ .ConfirmationURL }}
```

Do not build these links from `{{ .SiteURL }}`: doing so ignores the application's local or per-environment callback URL. For localized recovery links, the application sends the `next` destination through `resetPasswordForEmail`; do not insert real project URLs or keys into templates. Test signup confirmation and password reset against the local project. CAPTCHA, OAuth, custom SMTP, profile synchronization, and administrator-assignment tooling remain out of scope.

## Localization and contribution

All visible interface text belongs in aligned files under `messages/`. Add English, Amharic, and Spanish together, preserve locale-aware links, and request native review for sensitive content. Read [AGENTS.md](AGENTS.md), relevant docs, and the PR template before contributing.

## Security and deployment

Treat family data as sensitive. Never commit real keys or private documents; do not claim HIPAA, FERPA, COPPA, or other compliance. Deploy with separate development, staging, and production environments and review [docs/deployment.md](docs/deployment.md).

## Next recommended issue

`ETH-017 Secure source-grounded document Q&A`: plan a separate, authorized, cited question-and-answer boundary over completed document derivatives. It must not broaden OCR, expose unrestricted content search, or bypass the existing household/RLS boundary.
