# Testing strategy

Unit tests cover branding, translation alignment, validation, rendering contracts, and the document binder's URL/query boundary. Playwright covers locale routing, root redirect, responsive navigation, accessibility scanning, protected redirects, and controlled local document flows using only synthetic data. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:a11y`, and `pnpm build` before review; run the mutation-capable `pnpm test:e2e:documents:local` only against a local Supabase stack.

Database authorization is tested locally with pgTAP under `supabase/tests/database/`. The suite creates only synthetic Auth users inside a transaction and rolls back its data. It verifies Auth-trigger synchronization, default roles, grants, RLS isolation, atomic household creation, permission escalation denial, and immediate revocation. ETH-011 additionally covers owner/administrator writes, member/viewer read-only access, cross-household denial, archive visibility, household reassignment denial, and immediate revocation. ETH-012 adds checks for the private `family-documents` bucket, required upload columns and constraints, anonymous denial, owner/administrator/member preparation, viewer denial, cross-household and removed-member denial, dependent-household matching, immutable household/path metadata, authorized archive, active-query exclusion, and exact-path Storage policy isolation. ETH-014 adds local checks for marker-protected state transitions, queue idempotency, worker-only claim/complete/fail execution, lease ownership, bounded retries, archive cancellation, safe failure persistence, and parent-document derivative RLS. Never point these commands at a hosted project.

For document changes, reset and test the local database before application checks:

```bash
pnpm db:start
pnpm exec supabase db reset
pnpm exec supabase test db
pnpm exec supabase db lint --level error
pnpm db:types
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:e2e:documents:local
pnpm build
```

Application unit tests do not require a live database. They verify that member display data uses profiles with an email fallback, administrator authorization reads `user_roles`, Supabase clients use the generated contract, no server key reaches browser-safe modules, and dependent validation normalizes allowed input. ETH-012 validation coverage includes PDF, DOCX, and TXT acceptance; unsupported MIME and extension rejection; empty and over-20-MiB file rejection; safe filename and trusted-path generation; dependent access; viewer upload denial; signed-upload preparation/completion/failure handling; archive and signed-download authorization; dashboard active counts; no administrative-client import; no public URL generation; and the Server Action export rule.

ETH-013 unit coverage verifies bounded metadata-search normalization, injection-shaped input handling, strict dates, page normalization, UUID-dependent and household-level filters, status allowlists, controlled sort mapping, URL preservation, page metadata, household scope, default archive exclusion, active-dependent verification, no `select('*')`, and no elevated/public-storage access. The query tests use fluent-client mocks and assert the server derives its household context rather than accepting one from the URL. ETH-014 unit coverage must keep parser input limits, no-secret/browser boundary, constant-time internal-route authorization, deterministic chunking, and safe worker errors under test; the local pgTAP suite is the database authorization regression boundary.

The dedicated local-only Playwright document flow uses a synthetic owner, household, dependent, viewer, and TXT files. It covers binder authentication/empty state, English/Amharic/Spanish render, metadata search, dependent and status filters, title sorting, clear filters, query-preserving pagination, detail back navigation, authorized download, archive behavior, keyboard-opened mobile filters, and the controlled processing path. The test verifies that the internal worker route rejects a request with no processing secret, then queues a synthetic uploaded TXT document with keyboard input, invokes the local-only worker with a process-generated secret, and observes the completed status without reading extracted text. It also creates a local-only viewer membership and verifies that the viewer cannot see a processing control. Normal `pnpm test:e2e` leaves this mutation test skipped; use `pnpm test:e2e:documents:local` only after the local Supabase stack is running. Never weaken type checks, policies, or tests merely to make CI pass.

Run the controlled document browser workflow only with a local Supabase stack:

```bash
pnpm db:start
pnpm test:e2e:documents:local
```

That dedicated Playwright configuration derives its values from local `supabase status`, refuses any non-local API target, generates a process-only `DOCUMENT_PROCESSING_SECRET`, uses a separate local app port, and creates only synthetic test data. The normal `pnpm test:e2e` configuration leaves that mutation test skipped, so it remains non-mutating and must not be pointed at a hosted project.

Manual document checks use only a local Supabase project and small synthetic fixtures:

1. Start the local stack, reset migrations, set local environment values, run the app, then sign in and complete household onboarding.
2. Upload a small synthetic PDF, DOCX, and TXT file separately; verify each is shown as uploaded in the binder and detail page, appears in the dashboard count, and downloads through the authenticated signed route. Add a synthetic dependent and verify metadata search, dependent/household-level/category/MIME/lifecycle/processing/date filters, controlled sorting, clear filters, and pagination preserve URL state without exposing another household.
3. For a synthetic TXT document, request processing as an owner, administrator, and member; verify the queued/processing/completed status UX, safe retry behavior, dashboard counts, and that the page never displays extracted text, job errors, worker details, a signed URL, or a secret. Confirm that a viewer, removed member, unrelated household, archived record, and terminal result cannot queue work. Invoke the worker only through a local server-only secret and verify no-secret invocation is rejected.
4. Attempt an empty file, an unsupported extension or MIME type, and a file larger than 20 MiB; each must remain unsuccessful and must not be presented as uploaded.
5. Use synthetic accounts and local role changes to verify a viewer cannot upload, a removed member cannot read or download, and a second household cannot find the document or its derivatives.
6. Archive an uploaded document as an owner, administrator, and eligible original uploader; verify it leaves the default binder, appears only through the archive filter where existing RLS permits it, its active job is cancelled, its derivatives are inaccessible, and its object is not physically deleted by this issue. Check the mobile filter dialog with keyboard focus and request native Amharic and Spanish review before release.

Do not upload personal, production, or sensitive documents during automated or manual tests.
