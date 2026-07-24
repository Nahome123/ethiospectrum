# Secure document-processing foundation

ETH-014 adds a deliberately small, private processing foundation to the existing
private upload and metadata-only binder. It makes an authorized uploaded PDF,
DOCX, or TXT document eligible for server-side text extraction. It does not make
document text searchable or visible in the member UI.

This is not an OCR, AI analysis, embeddings, vector-search, document-chat,
translation, malware-scanning, public-sharing, notification, or retention/
deletion feature. Those capabilities need their own privacy, product, and
security reviews before they are added.

## Processing lifecycle

`public.documents.processing_status` is distinct from the upload/archive
lifecycle. A document must be uploaded and unarchived before it can be queued.

| Document status | Meaning                                                       | Next allowed status                               |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| `not_started`   | An eligible upload has not been requested for processing.     | `queued`                                          |
| `queued`        | A user-authorized request is waiting for a worker.            | `processing`, `failed`                            |
| `processing`    | One protected worker holds the job lease.                     | `completed`, `failed`, `unsupported`, `needs_ocr` |
| `completed`     | Bounded page and chunk text were committed atomically.        | terminal                                          |
| `failed`        | A safe, retryable worker failure occurred.                    | `queued`, while attempts remain                   |
| `unsupported`   | The current parser cannot handle the uploaded content safely. | terminal                                          |
| `needs_ocr`     | The PDF lacks sufficient extractable text.                    | terminal in this issue                            |

`public.document_processing_jobs` has one job per document. Its worker state
also includes `cancelled`, used when an active document is archived. Archive
state belongs to `documents.upload_status` and `deleted_at`; it supersedes any
processing state, removes active access, and is not a processing retry.

The queue function is idempotent: an existing `queued` or `processing` job is
returned instead of duplicated. A failed job can be requeued only before its
configured maximum of three attempts. Completed, unsupported, and OCR-needed
documents cannot be requeued by this foundation. `FOR UPDATE SKIP LOCKED` and a
unique job-to-document relationship ensure concurrent workers cannot claim the
same row.

## Trust boundaries and data flow

1. An authenticated owner, household administrator, or member requests
   processing from the document detail page. The browser supplies only the
   document ID; the database derives the user, household, eligibility, and
   retry limit.
2. `public.queue_document_processing` locks the trusted document/job records
   and performs the only browser-reachable processing-state mutation. Viewers,
   removed users, unrelated households, pending/failed uploads, archived rows,
   and terminal records are denied.
3. A scheduler calls the server-only internal route with a distinct
   `DOCUMENT_PROCESSING_SECRET`. The route accepts no document ID, path,
   filename, URL, or file body.
4. The server-only worker uses the administrative client solely in this
   reviewed background path. It claims at most a small bounded batch through a
   service-role-only RPC, then revalidates the returned private bucket, exact
   generated storage path, MIME type, and file-size boundary before downloading
   from private Storage.
5. The worker parses only server-side bytes and submits bounded output through
   a service-role-only completion or failure RPC. The database atomically
   validates the job lease, writes pages/chunks, and changes the terminal
   status. It never trusts a worker-selected household, document, or storage
   identity.

The worker does not make a signed URL or a public URL. It does not place file
contents, raw parser exceptions, storage paths, signed URLs, bearer tokens, or
private filenames in responses or logs. Its route returns only aggregate batch
counts on success and a generic temporary-unavailable response on failure.

`DOCUMENT_PROCESSING_SECRET` is independent of `SUPABASE_SECRET_KEY`, is
server-only, and must never be named with `NEXT_PUBLIC_`. The route compares it
in constant time. It is an invocation credential, not an end-user credential
or a replacement for database authorization.

## Extraction controls

The extraction boundary has intentionally strict limits:

- TXT uses strict UTF-8 decoding and rejects binary-looking input.
- DOCX is preflighted as a bounded ZIP archive before raw-text extraction.
  External file access and HTML conversion are not used.
- PDF extraction preserves page numbering. A textless PDF resolves to
  `needs_ocr`; OCR is not attempted.
- Normalized text, page rows, chunks, and total character volume are bounded.
  Chunks use deterministic, page-scoped indexes and estimated token counts;
  every newly written chunk is also database-capped at 1,200 characters.
- Completed output must contain valid page and chunk rows. Unsupported and
  OCR-needed terminal results cannot carry extraction output. Failure clears
  partial output.

The parser limits are defensive resource controls, not malware protection or a
claim that a document is safe. Content-signature validation and malware
scanning remain required follow-up work before any broader processing feature.

## Authorization and derivative privacy

Jobs, pages, chunks, and analyses force RLS. Normal browser sessions have no
direct job-table access and no direct write access to any derivative table.
The current member UI uses the narrow processing-status RPC result only:
status, attempt count, retry eligibility, and safe timestamps. It does not
render worker identity, lock state, error code/message, storage data, or text.

Page and chunk reads derive authorization from an active, uploaded,
unarchived parent document and active household membership. A caller who loses
parent-document access immediately loses derivative access. Archiving hides
the document, status, pages, and chunks from active user flows; it does not
physically delete the private object or derived rows in ETH-014. Retry and
failure workflows clear extracted rows so stale partial text is not retained.

## Operations runbook

### Configure and deploy

1. Apply and review the migration in a local or reviewed non-production
   Supabase environment first. Refresh generated types after a successful
   local migration.
2. Set a unique, high-entropy `DOCUMENT_PROCESSING_SECRET` of at least 32
   characters in the deployment's server-only environment. Do not reuse a
   Supabase key, commit it, place it in a test fixture, or expose it to the
   browser.
3. Configure an authenticated scheduler/platform job to send a `POST` request
   to `/api/internal/document-processing` with the secret only in the
   `x-document-processing-secret` header. Send no body and never pass the
   secret in a query string or URL.
4. Deploy the application only after the database migration and server-only
   environment configuration are present. A scheduler may run only after that
   deployment is healthy.

### GitHub Actions scheduler

This repository's `.github/workflows/document-processing.yml` invokes one
bounded batch every 15 minutes and includes `workflow_dispatch` for an
operator-triggered run. Add the following under **GitHub repository Settings →
Secrets and variables → Actions** before merging the workflow to the default
branch:

- `DOCUMENT_PROCESSING_SECRET` as a repository secret, with the same value as
  the deployed app's server-only variable.
- `DOCUMENT_PROCESSING_ORIGIN` as a repository variable containing only the
  HTTPS application origin, such as `https://ethiospectrum-web.vercel.app`.

The workflow has no `GITHUB_TOKEN` permissions and does not check out code. It
passes the secret only through the request header and logs only the endpoint's
aggregate processing result. Scheduled GitHub Actions runs use the workflow at
the latest default-branch commit, so a pull request deployment is not enough
to activate the timer.

An operator can test an approved environment without putting the value in shell
history by using a protected environment variable:

```bash
curl --fail --silent --show-error \
  -X POST "$APP_ORIGIN/api/internal/document-processing" \
  -H "x-document-processing-secret: $DOCUMENT_PROCESSING_SECRET"
```

A successful response contains aggregate counts only. A `401` means the
invocation credential was absent or invalid. A `503` is deliberately generic;
do not add an endpoint that returns document-specific failure details.

### Monitor and recover safely

- Monitor only aggregate job counts, queue age, and sanitized failure-code
  totals. Do not put document contents, filenames, storage paths, user email,
  signed URLs, or raw database/parser errors into telemetry.
- A user with queue permission may retry `failed` work through the UI while
  attempts remain. Do not manually alter `processing_status`, insert jobs, or
  edit page/chunk rows in a browser or SQL console to force a retry.
- `unsupported` and `needs_ocr` are terminal current-scope outcomes. Do not
  relabel them completed or use an unreviewed OCR provider to work around them.
- If the worker appears unhealthy, disable its scheduler, preserve the private
  data boundary, investigate aggregate/sanitized signals, rotate the distinct
  invocation secret when appropriate, and resume only after the reviewed fix.
- A stale worker lease is converted to a bounded safe failure by a later
  protected worker pass. Archive cancels active work; never revive an archived
  row merely to finish processing.

## Local verification

Use a local Supabase stack and synthetic documents only. Never point database
tests, the local Playwright config, or the internal worker test at a hosted
project.

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

The local document Playwright configuration creates a fresh process-only
processing secret and refuses a non-local Supabase URL. It verifies that a
secret-less worker request is rejected, a synthetic uploaded TXT document shows
the initial and queued statuses, can be keyboard-queued and processed through
the protected route, English/Amharic/Spanish completed labels render, and a
synthetic viewer cannot start processing. pgTAP separately verifies queue
idempotency, worker-only claim/complete/fail access, bounded retries, archive
cancellation, and parent-document derivative RLS.

Before release, perform keyboard/screen-reader/mobile checks on the new status
and retry controls and request native Amharic and Spanish review of the
processing terminology. Do not treat automated translation as native review.
