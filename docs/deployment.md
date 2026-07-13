# Deployment

Vercel-compatible deployment builds the Next.js application with environment variables supplied by the target environment. Keep development, staging, and production projects/secrets separate. Set only placeholders locally; server-only secrets must never be prefixed with `NEXT_PUBLIC_`. Before release, apply reviewed migrations, configure private storage and RLS tests, add secure headers/session settings, and verify rollback and backup restoration.
