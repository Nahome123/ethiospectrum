# Testing strategy

Unit tests cover branding, translation alignment, validation, and rendering contracts. Playwright covers locale routing, root redirect, responsive navigation, accessibility scanning, and protected redirects using only synthetic data. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:a11y`, and `pnpm build` before review.

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

Application unit tests do not require a live database. They verify that member display data uses profiles with an email fallback, administrator authorization reads `user_roles`, Supabase clients use the generated contract, no server key reaches browser-safe modules, and dependent validation normalizes allowed input. ETH-012 validation coverage includes PDF, DOCX, and TXT acceptance; unsupported MIME and extension rejection; empty and over-20-MiB file rejection; safe filename and trusted-path generation; dependent access; viewer upload denial; signed-upload preparation/completion/failure handling; archive and signed-download authorization; dashboard active counts; no administrative-client import; no public URL generation; and the Server Action export rule. Playwright covers protected documents redirects, translated empty and upload pages, accessible keyboard file selection and messages, controlled small synthetic upload/list/download/archive behavior where the local Storage test environment is available. Never weaken type checks, policies, or tests merely to make CI pass.

Run the controlled document browser workflow only with a local Supabase stack:

```bash
pnpm db:start
pnpm test:e2e:documents:local
```

That dedicated Playwright configuration derives its values from local `supabase status`, refuses any non-local API target, uses a separate local app port, and creates only synthetic test data. The normal `pnpm test:e2e` configuration leaves that mutation test skipped, so it remains non-mutating and must not be pointed at a hosted project.

Manual document checks use only a local Supabase project and small synthetic fixtures:

1. Start the local stack, reset migrations, set local environment values, run the app, then sign in and complete household onboarding.
2. Upload a small synthetic PDF, DOCX, and TXT file separately; verify each is shown as uploaded in the list and detail page, appears in the dashboard count, and downloads through the authenticated signed route.
3. Attempt an empty file, an unsupported extension or MIME type, and a file larger than 20 MiB; each must remain unsuccessful and must not be presented as uploaded.
4. Use synthetic accounts and local role changes to verify a viewer cannot upload, a removed member cannot read or download, and a second household cannot find the document.
5. Archive an uploaded document as an owner, administrator, and eligible original uploader; verify it leaves the active list while its object is not physically deleted by this issue.

Do not upload personal, production, or sensitive documents during automated or manual tests.
