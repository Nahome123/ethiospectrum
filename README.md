# Ethiospectrum

Ethiospectrum is a multilingual family-support platform foundation for organizing important information, understanding complex documents, tracking next steps, and finding educational resources in English, Amharic, and Spanish.

## Current status

Implemented: locale-prefixed public routes, responsive marketing UI, centralized branding, Supabase email/password authentication, profiles, isolated roles, households, household memberships, family onboarding, RLS-protected dependent profile management, private document upload/download/archive flows, a household-scoped digital document binder, controlled document processing, source-grounded document summaries with deterministic quality evaluation and household review, household-shared specialist support requests with read-only administrator triage, and a protected bilingual RBT Errorless Teaching study resource with user-only progress.

Planned: profile and household synchronization, document OCR, general-purpose AI answers, messaging, scheduling, billing, analytics, and monitoring. These integrations are not functional in this repository.

## ETH-022 personal reminders

ETH-022 adds opt-in, personal, in-app-only roadmap reminders. Active household users, including viewers, can create reminders only for themselves on readable active action items with due dates. Supported offsets are 0, 1, 3, and 7 days, with a default local time of 09:00. Users confirm an IANA timezone and consent per reminder; the server rejects ambiguous/nonexistent daylight-saving times and calculates UTC scheduling values. No email, SMS, push, recurrence, or external delivery provider is used.

## Stack and architecture

Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn Luma, next-intl, Zod, React Hook Form, Vitest, Playwright, and axe. Public routes live in `app/[locale]/(marketing)`. `proxy.ts` supports `/en`, `/am`, and `/es`; `/` redirects to `/en`. Household and document data belongs in Supabase behind row-level security.

## ETH-024 resource translations

ETH-024 adds reviewed Amharic (`am`) and Spanish (`es`) translations to ETH-023 resources. English is canonical; editors can draft, submit, withdraw, approve, or reject translations, with different-user review. Source versions are database-derived, and English content changes invalidate dependent translations atomically. Public routes choose current approved requested-locale content, then English with a localized fallback notice. Translation access is global-role-only and never loads household data. No machine translation, external translation API, assignment workflow, or ETH-025 support request functionality is included. Native Amharic and Spanish review remains required before release.

## ETH-025 specialist support requests

ETH-025 turns the dormant support placeholder into a household-shared, non-urgent support request workflow at `/[locale]/support`, reusing and extending the existing `support_threads` and `support_messages` tables plus a new immutable `support_request_events` audit table. An active owner, household administrator, or member creates a request with a 5–120 character subject, an allowlisted category, a preferred language (`en`, `am`, or `es`), and a 20–3,000 character initial description — but only after explicitly acknowledging, through an unchecked-by-default checkbox, that the request is not an emergency service, guarantees no response, appointment, benefit, service, eligibility, representation, advice, or outcome, and is visible to all active household members. The server rejects unacknowledged submissions and stores its own acknowledgment timestamp and controlled copy version.

Every active household member, including viewers, can read household requests, their append-only messages, and audit events. Owners, household administrators, and members may add 1–2,000 character follow-up messages while a request is open; messages can never be edited or deleted. The requester may close or cancel their own open request; owners and household administrators may close or cancel any open household request; a member may not close or cancel another member's request. `open → closed` and `open → cancelled` are the only transitions — both require a confirmation dialog and a current version for optimistic concurrency, and closed or cancelled requests stay readable but permanently reject new messages, edits, and reopening. Bounds: at most five open requests per household, at most 50 messages per request, and idempotent request/message creation with opaque client keys.

Platform administrators get a read-only triage queue at `/[locale]/admin/support-requests` showing household label, subject, category, language, status, and activity; they cannot respond, close, cancel, assign, or alter households through ETH-025. Specialists have no support-request access of any kind — even when a dormant active `household_specialists` row exists — because the previous `can_access_household()`-based policies are replaced with member-or-platform-administrator policies. ETH-026 owns specialist assignment, access grants, responses, revocation, workload views, and notifications. ETH-025 adds no emergency handling, response-time or service guarantee, attachments, dependent/document/roadmap/reminder linkage, notifications, external rate-limiting provider, machine translation, or new environment variable. Native Amharic and Spanish review remains required before release.

## Member resource discovery

Signed-in members can browse a protected, multilingual learning hub at `/[locale]/member/resources` with database-backed search, topic and resource-type filters, pagination, “For You,” featured, saved, and latest sections. Members can privately bookmark reviewed resources and add a localized resource to their active household roadmap without supplying household identity or content from the browser. Administrators curate type and featured position through the existing resource workflow; account assignments populate “For You” while all published resources remain available in the full member catalog. The hub uses local icon/color artwork and no external recommendation, analytics, or image provider.

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

ETH-017 adds one-document, source-grounded Q&A over completed private document derivatives. Active owners, administrators, and members may submit one bounded question in English, Amharic, or Spanish; active viewers may read an existing answer but cannot start provider work. PostgreSQL derives identity, household, document eligibility, duplicate/retry state, and a normalized same-document/language question key. A protected worker loads only that document's bounded pages/chunks, maps provider-supplied opaque source keys back to trusted excerpts, and stores a concise answer with explicit citations. Questions are not conversational memory, an unrestricted document search, cross-document retrieval, public sharing, professional advice, or a claim of accuracy. Verify important answers against the original document.

The Q&A provider boundary uses server-only `OPENAI_API_KEY` and `OPENAI_QUESTION_MODEL`; its internal route requires a separate high-entropy `DOCUMENT_QUESTION_SECRET`. None may use a `NEXT_PUBLIC_` prefix, be sent by a browser, or be reused from Supabase, processing, summary, or OCR secrets. The Q&A worker accepts no document ID or question in its request and returns aggregate counts only.

ETH-018 adds a deterministic, local quality evaluation for a completed ETH-015 summary on the existing document-detail route. It validates the stored structured output, source-reference format and same-document page/chunk ownership, citation coverage, bounded output and excerpts, partial-document disclosure, and unsupported markup without making another AI or paid-provider call. The evaluation stores bounded scores, codes, and warnings separately from the summary-generation lifecycle; it does not regenerate or modify the summary.

Active household members, including viewers, may read an accessible evaluation and review history. Owners, household administrators, and members may save their own pending feedback, but only owners and household administrators can approve, reject, or mark a summary as needing revision. Approval means only “approved for this household's internal use”; it is not clinical, legal, medical, provider, or accuracy verification. Reviews derive the household and reviewer from the trusted session, are one-per-reviewer per summary, cannot be reassigned or edited after a final decision, and disappear from normal access after archive, removal, or cross-household denial. ETH-018 adds no environment variables, worker, provider call, document Q&A, OCR, page-citation interface, or public sharing.

ETH-019 extends, but does not replace, ETH-017 quick one-turn Q&A. Active owners, administrators, and members can use `/[locale]/documents/[documentId]/chat` to create persistent, household-shared conversations for one processed, accessible document, then continue them at `/[locale]/documents/[documentId]/chat/[conversationId]`. Viewers can read accessible conversations only. Each conversation fixes its English, Amharic, or Spanish response language; a new conversation is required to use another language. Every write is an atomic database operation that creates or reuses an idempotent user-message/assistant-placeholder pair, so a refresh, repeated action, or retry cannot create duplicate assistant responses.

Chat reuses ETH-017's server-only `OPENAI_API_KEY`, `OPENAI_QUESTION_MODEL`, `DOCUMENT_QUESTION_SECRET`, structured-provider boundary, bounded source selection, worker queue, and source validation. A worker sends at most the latest ten completed conversation messages as context and always supplies source evidence only from the current document's processed chunks; prior assistant messages never count as evidence. A grounded response stores only validated page/chunk coordinates. Unsupported or out-of-document questions have explicit localized fallback result types without citations. Provider or citation-validation failures preserve the user message, store a safe failed placeholder, and allow an authorized retry.

ETH-020 adds keyboard-operable citation controls to completed summaries, one-turn Q&A, and chat. Opening a citation resolves its persisted summary, answer, or assistant-message owner through a narrow household-authorized database RPC; the browser receives only a bounded verified excerpt and safe page or logical-section label. It never receives a source row ID, chunk ID, storage path, signed URL, raw derivative collection, or cross-household result. Invalid, archived, removed, unavailable, and unauthorized sources share one generic unavailable state. For a valid PDF citation only, a separate authorized route creates a fresh short-lived private viewer URL at the validated page. DOCX and TXT citations use logical sections and never offer page navigation. Partial results stay explicitly marked as partial and important content must be checked against the original document.

The RBT resource is available after sign-in at `/[locale]/training/rbt`; individual sections are direct links under `/[locale]/training/rbt/{overview|procedure|error-correction|setup|flashcards|glossary|takeaways}`. It preserves the supplied bilingual lesson and attribution as an educational study resource, with no certification, score, competency, or clinical claim. Reading progress is limited to the signed-in user by RLS and an identity-derived RPC. Review [the RBT source and content-review notes](docs/rbt-training-source.md) before release; run `pnpm test:e2e:training:local` only against local Supabase with synthetic users.

For a local manual check, run the local Supabase stack and reset the database, sign in with synthetic users, complete household onboarding, and upload small synthetic PDF, DOCX, and TXT files with several titles, categories, and one active dependent. Confirm that the binder's metadata search, each filter, controlled sort, clear action, date range, pagination, mobile filter dialog, detail back link, dashboard links/counts, and 60-second signed download work for the current household only. Archive a record and confirm it disappears from the default binder, remains visible only through the archive-status filter when RLS allows it, and leaves its private object intact. Also verify empty, unsupported, and over-20-MiB file behavior. Do not use real personal documents or hosted production data for these checks.

For a local ETH-015 check, use only synthetic processed documents and a mocked provider response. Confirm that owner, administrator, and member accounts can request an eligible language-specific summary; a viewer can read an existing summary but has no generation control; a removed member and another household cannot read or request it; and queued/generating/failed/completed states are honest. Verify English, Amharic, and Spanish UI separately, treat Amharic and Spanish output as requiring native review, and do not enter a real API key or sensitive document into automated tests.

For a local ETH-018 check, complete a synthetic summary and use the detail page to run its quality evaluation. Confirm that scores, citation coverage, full/partial coverage, and safe warnings render without raw source identifiers or evaluator errors. Test owner and administrator approval/rejection, member feedback-only behavior, viewer read-only behavior, an unrelated household, a removed member, archive access revocation, duplicate review submission, keyboard navigation, and English, Amharic, and Spanish wrapping. Do not use a live provider, real document, or hosted project for these checks.

For a local ETH-019 check, use only a synthetic completed document with chunks. Start an English, Amharic, and Spanish conversation as a non-viewer; complete queued responses through a mocked provider or the service-only synthetic completion function; refresh and reopen each conversation; verify a viewer is read-only; and confirm removed/unrelated users and archived documents are denied. Test insufficient-evidence and out-of-document fallback results, a failed response retry, one pending response per conversation, keyboard composition, narrow layout, and 200% zoom. Do not use a live provider or personal document.

For a local ETH-020 check, use only synthetic completed PDF, DOCX, and TXT documents with completed summary, Q&A, and chat records. Open a citation with keyboard and mouse, confirm the evidence panel shows a short verified excerpt, correct page/section label, partial-result notice when applicable, focus return on close, and English/Amharic/Spanish wrapping. Confirm a valid PDF citation opens the private original at its stored page, while DOCX/TXT do not offer original-page navigation. Try a stale owner ID, malformed citation index, cross-household user, removed member, and archived document: each must show the same unavailable state, never an error detail or source text. Confirm normal browser requests cannot enumerate `document_pages` or `document_chunks`. Do not use a live provider, real document, or hosted project.

For a local ETH-025 check, run the local Supabase stack with synthetic accounts only. As an owner, household administrator, and member, create a support request and confirm the disclaimer, household-visibility notice, and required unchecked acknowledgment appear before submission; verify subject/description bounds, the category and language allowlists, and that a viewer sees read-only lists without create, message, close, or cancel controls. Add follow-up messages, confirm they cannot be edited or deleted, close one request and cancel another through their confirmation dialogs, and verify closed/cancelled requests reject new messages and cannot be reopened. Confirm the five-open-request and 50-message caps, that a removed member and an unrelated household see nothing, that a synthetic platform administrator sees only the read-only triage queue, and that a synthetic specialist — even with an active dormant assignment row — is denied everywhere. Run `pnpm test:e2e:support:local` only against local Supabase, and treat the Amharic and Spanish support wording as awaiting native review.

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

ETH-021 is implemented locally as a household roadmap with active-item and archived-item views, controlled filters and pagination, create/edit/detail routes, role-bounded assignment, controlled status changes, completion tracking, archive/restore, and owner/administrator manual ordering. It has no reminder, notification, scheduling, worker, provider, or deployment behavior. Native Amharic and Spanish review plus a reviewed non-production migration rollout remain required; this does not imply a hosted migration or deployment.

With ETH-025 implemented locally, ETH-026 specialist assignment is the next recommended issue: explicit administrator-granted specialist access with an assignment lifecycle, least privilege, and immediate revocation. ETH-025 deliberately ships without any specialist read or write path so ETH-026 can add it as a reviewed, deliberate grant.
