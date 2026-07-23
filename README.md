# Ethiospectrum

Ethiospectrum is a multilingual family-support platform foundation for organizing important information, understanding complex documents, tracking next steps, and finding educational resources in English, Amharic, and Spanish.

## Current status

Implemented: locale-prefixed public routes, responsive marketing UI, centralized branding, Supabase email/password authentication, profiles, isolated roles, households, household memberships, family onboarding, and RLS-protected dependent profile management.

Planned: profile and household synchronization, private storage, document upload/OCR/processing, AI answers, messaging, scheduling, billing, analytics, and monitoring. These integrations are not functional in this repository.

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

For local-only administrator testing, use a direct SQL console against the local database after creating a synthetic user: `update public.user_roles set role = 'administrator' where user_id = '<synthetic UUID>';`. Do not run this against a hosted project without a reviewed role-governance procedure.

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

`ETH-012 Implement secure document upload`.
