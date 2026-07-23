# Deployment

Vercel-compatible deployment builds the Next.js application with environment variables supplied by the target environment. Keep development, staging, and production projects/secrets separate. Set only placeholders locally; server-only secrets must never be prefixed with `NEXT_PUBLIC_`. Before release, run the local database reset, pgTAP suite, database lint, generated-type refresh, and application checks. Review migrations in a non-production Supabase environment first; use `pnpm db:push:dry-run` to review a hosted change and run `pnpm db:push` only with explicit approval. Configure private storage, secure headers/session settings, rollback, and backup restoration before release.

ETH-014 additionally requires a distinct, high-entropy server-only `DOCUMENT_PROCESSING_SECRET` in each deployed environment. Configure a reviewed internal scheduler to `POST` the protected document-processing route with that value in `x-document-processing-secret`; do not use a URL parameter, request body, browser client, or `SUPABASE_SECRET_KEY` as a substitute. Deploy the migration and secret before enabling the scheduler. Monitor only aggregate job health and sanitized error-code counts. The route processes a bounded batch and must not be exposed as an unauthenticated public cron endpoint. Follow [document-processing-design.md](document-processing-design.md) for rotation, failure, and local-only verification procedures.

The repository includes `.github/workflows/document-processing.yml` for the approved GitHub Actions scheduler. It runs every 15 minutes and supports a manual run. Before merging it into the default branch, set these repository-level Actions values:

- Secret: `DOCUMENT_PROCESSING_SECRET` — the same distinct secret configured for the deployed app, never a Supabase key.
- Variable: `DOCUMENT_PROCESSING_ORIGIN` — the HTTPS deployed app origin, for example `https://ethiospectrum-web.vercel.app`, without a trailing path.

The workflow has no repository-token permissions and does not check out source code. It sends the secret only as an environment-backed request header. GitHub schedules use the workflow from the latest default-branch commit, so merge and deploy the application before relying on scheduled runs.
