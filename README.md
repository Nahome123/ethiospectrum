# Ethiospectrum

Ethiospectrum is a multilingual family-support platform foundation for organizing important information, understanding complex documents, tracking next steps, and finding educational resources in English, Amharic, and Spanish.

## Current status

Implemented: locale-prefixed public routes, responsive marketing UI, centralized branding, Supabase email/password authentication, claims-protected member routes, default-deny administrator routes, member/admin shells, future AI schemas/prompts, schema/RLS migrations, CI templates, and testing configuration.

Planned: real Supabase authentication and storage, document upload/OCR/processing, AI answers, messaging, scheduling, billing, email, analytics, and monitoring. These integrations are not functional in this repository.

## Stack and architecture

Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn Luma, next-intl, Zod, React Hook Form, Vitest, Playwright, and axe. Public routes live in `app/[locale]/(marketing)`. `proxy.ts` supports `/en`, `/am`, and `/es`; `/` redirects to `/en`. Future private data belongs in Supabase with row-level security.

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
```

## Supabase and migrations

Do not point local work at production data. The public marketing app intentionally runs without Supabase credentials. For local integration work only, start a local Supabase project with the Supabase CLI, then copy its API URL, publishable key, and secret key into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local-publishable-key>
SUPABASE_SECRET_KEY=<local-secret-key>
```

Apply `supabase/migrations/` only through the local Supabase CLI or a reviewed migration workflow, then validate the RLS matrix in `supabase/policies/README.md`. The publishable key is a public client credential constrained by RLS; the secret key bypasses RLS and must remain server-only. Never prefix it with `NEXT_PUBLIC_`, add it to a browser bundle, commit `.env.local`, or use it for ordinary user requests.

`lib/supabase/browser.ts` is the only browser client entry point. Server Component, route-handler, server-action, proxy, and admin utilities are separate modules. They throw a clear development configuration error when invoked without the required local values; they do not create a placeholder session or fake user.

## Supabase Auth setup

Enable Email/Password authentication and require email confirmation in the Supabase Dashboard. In Authentication URL Configuration, add the local callback pattern `http://localhost:3000/**` (replace the port when needed), the production callback `https://<your-domain>/auth/confirm`, and the Vercel preview pattern `https://*.vercel.app/auth/confirm` if previews are enabled. Set the Site URL to the canonical production origin before production launch.

ETH-008 uses a cookie-based PKCE flow. In the Supabase **Confirm signup** and **Reset password** email templates, keep the confirmation link pointed at Supabase's generated URL. It preserves the application's safe `redirectTo` callback and the one-time confirmation data:

```text
{{ .ConfirmationURL }}
```

Do not build these links from `{{ .SiteURL }}`: doing so ignores the application's local or per-environment callback URL. For localized recovery links, the application sends the `next` destination through `resetPasswordForEmail`; do not insert real project URLs or keys into templates. Test signup confirmation and password reset against the local project. CAPTCHA, OAuth, custom SMTP, profile synchronization, storage upload, and administrator-assignment tooling remain out of scope.

## Localization and contribution

All visible interface text belongs in aligned files under `messages/`. Add English, Amharic, and Spanish together, preserve locale-aware links, and request native review for sensitive content. Read [AGENTS.md](AGENTS.md), relevant docs, and the PR template before contributing.

## Security and deployment

Treat family data as sensitive. Never commit real keys or private documents; do not claim HIPAA, FERPA, COPPA, or other compliance. Deploy with separate development, staging, and production environments and review [docs/deployment.md](docs/deployment.md).

## Next recommended issue

`ETH-009 Add profile synchronization and executable RLS tests`.
