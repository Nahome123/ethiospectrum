# Ethiospectrum engineering rules

- Read relevant documentation and existing patterns before changing code; keep work scoped to the requested issue and avoid unrelated files.
- Preserve the shadcn `base-luma` preset. Use Server Components by default and Client Components only when interaction requires them.
- Keep Ethiospectrum branding centralized in `config/brand.ts`; never use placeholder product names.
- Put visible text in translations and add aligned English, Amharic, and Spanish keys together. Review multilingual and accessibility impact; Amharic remains LTR.
- Validate external inputs with Zod, avoid `any`, do not hide errors with empty catches, and add tests for new behavior.
- Never expose server secrets, log private documents, use production data in fixtures, or weaken authorization to pass tests. Household authorization belongs on server and database layers.
- Do not create fake integrations or mark incomplete features as complete. Record assumptions and update architecture documentation when it changes.
- Run formatting, linting, type checking, tests, and build when relevant; report commands and failures.
