# Row Level Security policy test plan

Run against a local Supabase instance using authenticated JWTs for synthetic users. Test Household A own access, cross-household denial, anonymous denial, content-editor denial of household data, unassigned-specialist denial, explicit specialist assignment access, and immediate denial after membership removal. Exercise `documents`, `document_pages`, and `document_chunks` as one access chain. `document_analyses` is dormant and deny-by-default until a separately reviewed feature grants access. Do not use production records.

Verify household onboarding through `complete_household_onboarding`: it requires authentication, validates the household name and consent policy version, stays idempotent for an account that already has an active household, and records one `household_onboarding` consent row per accepted policy version.

Verify `training_progress` separately from household data: anonymous users cannot select or record progress; a signed-in user can create, view, and complete only their own fixed-course row; another user cannot read, insert for, or update that row; duplicate/unknown sections and alternate course keys are rejected; and completion is set only after all seven allowed RBT sections are recorded.
