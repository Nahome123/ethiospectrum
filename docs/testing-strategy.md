# Testing strategy

Unit tests cover branding, translation alignment, validation, rendering contracts, and the document binder's URL/query boundary. Playwright covers locale routing, root redirect, responsive navigation, accessibility scanning, protected redirects, and controlled local document flows using only synthetic data. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:a11y`, and `pnpm build` before review.

Database authorization is tested locally with pgTAP under `supabase/tests/database/`. The suite creates only synthetic Auth users inside a transaction and rolls back its data. It verifies Auth-trigger synchronization, default roles, grants, RLS isolation, atomic household creation, permission escalation denial, and immediate revocation. ETH-011 additionally covers owner/administrator writes, member/viewer read-only access, cross-household denial, archive visibility, household reassignment denial, and immediate revocation. ETH-012 adds checks for the private `family-documents` bucket, required upload columns and constraints, anonymous denial, owner/administrator/member preparation, viewer denial, cross-household and removed-member denial, dependent-household matching, immutable household/path metadata, authorized archive, active-query exclusion, and exact-path Storage policy isolation. Never point these commands at a hosted project.

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
pnpm build
```

Application unit tests do not require a live database. They verify that member display data uses profiles with an email fallback, administrator authorization reads `user_roles`, Supabase clients use the generated contract, no server key reaches browser-safe modules, and dependent validation normalizes allowed input. ETH-012 validation coverage includes PDF, DOCX, and TXT acceptance; unsupported MIME and extension rejection; empty and over-20-MiB file rejection; safe filename and trusted-path generation; dependent access; viewer upload denial; signed-upload preparation/completion/failure handling; archive and signed-download authorization; dashboard active counts; no administrative-client import; no public URL generation; and the Server Action export rule.

ETH-013 unit coverage verifies bounded metadata-search normalization, injection-shaped input handling, strict dates, page normalization, UUID-dependent and household-level filters, status allowlists, controlled sort mapping, URL preservation, page metadata, household scope, default archive exclusion, active-dependent verification, no `select('*')`, and no elevated/public-storage access. The query tests use fluent-client mocks and assert the server derives its household context rather than accepting one from the URL. Because no migration was added, the existing local pgTAP document/RLS suite remains the database authorization regression boundary.

The dedicated local-only Playwright document flow uses a synthetic owner, household, dependent, and TXT files. It covers binder authentication/empty state, English/Amharic/Spanish render, metadata search, dependent and status filters, title sorting, clear filters, query-preserving pagination, detail back navigation, authorized download, archive behavior, and keyboard-opened mobile filters. Normal `pnpm test:e2e` leaves this mutation test skipped; use `pnpm test:e2e:documents:local` only after the local Supabase stack is running. Viewer browser setup is not a product flow yet, so its upload/download boundary remains covered by the server/RLS tests and must be manually rechecked with a reviewed local-only setup. Never weaken type checks, policies, or tests merely to make CI pass.

Run the controlled document browser workflow only with a local Supabase stack:

```bash
pnpm db:start
pnpm test:e2e:documents:local
```

That dedicated Playwright configuration derives its values from local `supabase status`, refuses any non-local API target, uses a separate local app port, and creates only synthetic test data. The normal `pnpm test:e2e` configuration leaves that mutation test skipped, so it remains non-mutating and must not be pointed at a hosted project.

Manual document checks use only a local Supabase project and small synthetic fixtures:

1. Start the local stack, reset migrations, set local environment values, run the app, then sign in and complete household onboarding.
2. Upload a small synthetic PDF, DOCX, and TXT file separately; verify each is shown as uploaded in the binder and detail page, appears in the dashboard count, and downloads through the authenticated signed route. Add a synthetic dependent and verify metadata search, dependent/household-level/category/MIME/lifecycle/processing/date filters, controlled sorting, clear filters, and pagination preserve URL state without exposing another household.
3. Attempt an empty file, an unsupported extension or MIME type, and a file larger than 20 MiB; each must remain unsuccessful and must not be presented as uploaded.
4. Use synthetic accounts and local role changes to verify a viewer cannot upload, a removed member cannot read or download, and a second household cannot find the document.
5. Archive an uploaded document as an owner, administrator, and eligible original uploader; verify it leaves the default binder, appears only through the archive filter where existing RLS permits it, and its object is not physically deleted by this issue. Check the mobile filter dialog with keyboard focus and request native Amharic and Spanish review before release.

Do not upload personal, production, or sensitive documents during automated or manual tests.
