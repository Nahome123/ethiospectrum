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
          question_id: "70000000-0000-4000-8000-000000000007",
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

    await expect(
      getDocumentQuestionDetails("30000000-0000-4000-8000-000000000003", "application/pdf"),
    ).resolves.toEqual([
      {
        id: "70000000-0000-4000-8000-000000000007",
        question: "What is the next step?",
        language: "en",
        status: "completed",
        retryable: false,
        completedAt: "2026-07-25T00:00:00.000Z",
        sourceCoverage: "full",
        answer: "A source-grounded answer.",
        sourceReferences: [
          {
            sourceNumber: 1,
            ownerType: "document_qa_answer",
            ownerId: "70000000-0000-4000-8000-000000000007",
            citationIndex: 0,
            documentId: "30000000-0000-4000-8000-000000000003",
            pageNumber: 1,
            pageStart: 1,
            pageEnd: null,
            sectionLabel: null,
            sectionNumber: null,
            sourceKind: "page",
            availability: "unknown",
            canOpenOriginal: true,
            isPartialDocument: false,
          },
        ],
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_document_questions", {
      target_document_id: "30000000-0000-4000-8000-000000000003",
    });
  });
});
