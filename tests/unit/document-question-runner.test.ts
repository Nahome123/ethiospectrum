import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentQuestionProvider } from "@/lib/documents/questions/types";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { runDocumentQuestionBatch } from "@/lib/documents/questions/runner";

const job = {
  question_id: "40000000-0000-4000-8000-000000000004",
  document_id: "30000000-0000-4000-8000-000000000003",
  household_id: "10000000-0000-4000-8000-000000000001",
  language: "en",
  question: "What is the next step?",
  prompt_version: "document-question-v1",
  attempt_count: 1,
  max_attempts: 3,
};

function selectBuilder(result: unknown) {
  const builder = { eq: vi.fn(), order: vi.fn(), maybeSingle: vi.fn() };
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);
  return Object.assign(builder, { then: Promise.resolve(result).then.bind(Promise.resolve(result)) });
}

function createAdmin() {
  const documentBuilder = selectBuilder({
    data: {
      id: job.document_id,
      household_id: job.household_id,
      upload_status: "uploaded",
      processing_status: "completed",
      deleted_at: null,
    },
    error: null,
  });
  const chunksBuilder = selectBuilder({
    data: [
      {
        id: "50000000-0000-4000-8000-000000000005",
        document_id: job.document_id,
        page_id: "60000000-0000-4000-8000-000000000006",
        page_number: 1,
        chunk_index: 0,
        content: "Synthetic source content.",
      },
    ],
    error: null,
  });
  const pagesBuilder = selectBuilder({
    data: [
      {
        id: "60000000-0000-4000-8000-000000000006",
        document_id: job.document_id,
        page_number: 1,
        extracted_text: "Synthetic source content.",
      },
    ],
    error: null,
  });
  const from = vi.fn((table: string) => ({
    select: vi.fn(() =>
      table === "documents" ? documentBuilder : table === "document_chunks" ? chunksBuilder : pagesBuilder,
    ),
  }));
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: [job], error: null })
    .mockResolvedValueOnce({ data: true, error: null });
  return { from, rpc };
}

function providerWith(sourceKeys: readonly string[] = ["src_001"]): DocumentQuestionProvider {
  return {
    answer: vi.fn().mockResolvedValue({
      provider: "synthetic-provider",
      modelIdentifier: "synthetic-question-model",
      providerCallCount: 1,
      answer: { answer: "The synthetic next step is documented.", sourceKeys },
    }),
  };
}

describe("document question runner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses server-loaded sources and completes only a cited, bounded answer", async () => {
    const admin = createAdmin();
    await expect(
      runDocumentQuestionBatch(1, { adminClient: admin as never, provider: providerWith() }),
    ).resolves.toEqual({ processed: 1, completed: 1, failed: 0 });
    expect(admin.rpc).toHaveBeenNthCalledWith(1, "claim_next_document_question_job", {
      worker_identity: expect.stringMatching(/^document-question-worker-/),
    });
    expect(admin.rpc).toHaveBeenNthCalledWith(2, "complete_document_question_job", {
      target_question_id: job.question_id,
      expected_worker_identity: expect.stringMatching(/^document-question-worker-/),
      completed_answer_text: "The synthetic next step is documented.",
      completed_source_coverage: "full",
      completed_source_item_count: 1,
      completed_source_character_count: "Synthetic source content.".length,
      completed_provider: "synthetic-provider",
      completed_model_identifier: "synthetic-question-model",
      completed_provider_call_count: 1,
      completed_source_references: [
        {
          reference_id: "source-1",
          page_id: "60000000-0000-4000-8000-000000000006",
          page_number: 1,
          chunk_id: "50000000-0000-4000-8000-000000000005",
          chunk_index: 0,
          excerpt: "Synthetic source content.",
        },
      ],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/en/documents/${job.document_id}`);
  });

  it("fails safely when a provider fabricates a source key", async () => {
    const admin = createAdmin();
    await expect(
      runDocumentQuestionBatch(1, { adminClient: admin as never, provider: providerWith(["src_999"]) }),
    ).resolves.toEqual({ processed: 1, completed: 0, failed: 1, failureCodes: { source_validation_failed: 1 } });
    expect(admin.rpc).toHaveBeenNthCalledWith(2, "fail_document_question_job", {
      target_question_id: job.question_id,
      expected_worker_identity: expect.any(String),
      safe_error_code: "source_validation_failed",
    });
  });
});
