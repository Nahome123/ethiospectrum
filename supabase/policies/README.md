# Row Level Security policy test plan

Run against a local Supabase instance using authenticated JWTs for synthetic users. Test Household A own access, cross-household denial, anonymous denial, content-editor denial of household data, unassigned-specialist denial, explicit specialist assignment access, and immediate denial after membership removal. Exercise `documents`, `document_pages`, `document_chunks`, and `document_analyses` as one access chain. Do not use production records.
