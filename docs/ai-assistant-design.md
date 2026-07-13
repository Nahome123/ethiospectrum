# AI assistant design

No AI API is connected. Future requests will authorize the household first, retrieve only permitted chunks, preserve page numbers, produce structured Zod-validated answers, record model and prompt versions, and permit feedback. The response separates answer, citations, general information, suggested questions, and limitations; insufficient evidence is an expected result.

Prompts are versioned placeholders under `prompts/`. Runtime logging must contain no private document content. The assistant cannot make unsupported legal, medical, immigration, eligibility, or outcome conclusions.
