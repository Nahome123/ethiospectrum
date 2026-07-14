# Security and privacy

Family, dependent, education, healthcare, benefit, and document information are sensitive. The planned trust boundary is browser → authorized server action/API → Supabase with RLS → private storage and background workers. Service-role credentials stay server-side. Signed URLs are short-lived; document content is never placed in source control, logs, analytics, test fixtures, or prompts beyond an authorized runtime request.

RLS is enabled on every private table. Household membership, explicit specialist assignment, and administrator checks govern access. Content editors can manage resources but cannot read household records. Security controls planned before production include file type/size validation, malware scanning, rate limits, secure sessions, CSRF review, headers, audit trails, deletion workflows, backups/restoration testing, least privilege, and administrator MFA.

## Supabase credentials and privileged access

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are the only Supabase values allowed in browser configuration. The publishable key is not a bypass credential: database and storage access must remain constrained by RLS and storage policies. `SUPABASE_SECRET_KEY` is validated only in a `server-only` module and is never imported by browser utilities.

The elevated client in `lib/supabase/admin.ts` bypasses RLS. It is permitted only for reviewed administrative or background operations that cannot run under the requesting user’s RLS context. Do not use it in Client Components, ordinary route UI, or normal user-request flows; do not log it, serialize it, or expose it through `NEXT_PUBLIC_` configuration. Local development must use a local Supabase project and synthetic data, never a production project or production credentials.

Professional review is required for threat modeling, retention periods, incident response, regional/privacy obligations, HIPAA/FERPA/COPPA applicability, legal copy, and production penetration testing. This foundation makes no compliance claim.

## ETH-008 authentication controls

Supabase email/password authentication uses cookie-based PKCE sessions. Server authorization uses verified JWT claims through `auth.getClaims()` rather than `getSession()`, client state, or user metadata. The confirmation callback validates either a PKCE code or approved token-hash type without logging the code, hash, callback URL, cookies, access tokens, refresh tokens, or passwords. All return destinations must be supported-locale relative paths, preventing open redirects.

Password-recovery responses are neutral to avoid account enumeration. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the only Supabase credential available to browser code. `SUPABASE_SECRET_KEY` remains in the `server-only` elevated client for reviewed background or administrative work and is not used for ordinary sign-in, sign-up, or recovery. CAPTCHA, production rate-limit monitoring, template review, CSRF/CSP review, and administrator role-governance require follow-up security review before production use.
