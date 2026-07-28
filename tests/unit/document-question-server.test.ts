import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServerComponentSupabaseClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerComponentSupabaseClient: mocks.createServerComponentSupabaseClient,
  getCurrentHousehold: vi.fn(),
  getCurrentSupabaseClaims: vi.fn(),
}));

import { getDocumentQuestionDetails } from "@/lib/documents/server";

describe("document question server read boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the narrow question-read RPC instead of direct browser-readable table selection", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          question: "What is the next step?",
          language: "en",
          status: "completed",
          retryable: false,
          completed_at: "2026-07-25T00:00:00.000Z",
          source_coverage: "full",
          answer_text: "A source-grounded answer.",
          source_references: [
            {
              reference_id: "source-1",
              page_id: "60000000-0000-4000-8000-000000000006",
              page_number: 1,
              chunk_id: "50000000-0000-4000-8000-000000000005",
              chunk_index: 0,
              excerpt: "Synthetic source content.",
            },
          ],
        },
      ],
      error: null,
    });
    mocks.createServerComponentSupabaseClient.mockResolvedValue({ rpc, from: vi.fn() });

    await expect(getDocumentQuestionDetails("30000000-0000-4000-8000-000000000003")).resolves.toEqual([
      {
        question: "What is the next step?",
        language: "en",
        status: "completed",
        retryable: false,
        completedAt: "2026-07-25T00:00:00.000Z",
        sourceCoverage: "full",
        answer: "A source-grounded answer.",
        sourceReferences: [{ page_number: 1, chunk_index: 0, excerpt: "Synthetic source content." }],
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_document_questions", {
      target_document_id: "30000000-0000-4000-8000-000000000003",
    });
  });
});
