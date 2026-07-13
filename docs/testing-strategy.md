# Testing strategy

Unit tests cover branding, translation alignment, validation, and rendering contracts. Playwright covers locale routing, root redirect, responsive navigation, accessibility scanning, and protected redirects using only synthetic data. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:a11y`, and `pnpm build` before review.

RLS requires a local Supabase execution plan in `supabase/policies/README.md`. Never weaken type checks, policies, or tests merely to make CI pass.
