import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentChatProvider } from "@/lib/documents/chat/types";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { runDocumentChatBatch } from "@/lib/documents/chat/runner";

const job = {
  message_id: "40000000-0000-4000-8000-000000000004",
  conversation_id: "41000000-0000-4000-8000-000000000004",
  document_id: "30000000-0000-4000-8000-000000000003",
  household_id: "10000000-0000-4000-8000-000000000001",
  language: "en",
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
  const chunkBuilder = selectBuilder({
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
  const pageBuilder = selectBuilder({
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
  const historyBuilder = selectBuilder({
    data: [
      { role: "user", status: "completed", content: "What does the document say?", sequence_number: 1 },
      { role: "assistant", status: "completed", content: "Earlier answer", sequence_number: 2 },
      { role: "user", status: "completed", content: "What is next?", sequence_number: 3 },
    ],
    error: null,
  });
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => {
      if (table === "documents") return documentBuilder;
      if (table === "document_chunks") return chunkBuilder;
      if (table === "document_pages") return pageBuilder;
      return historyBuilder;
    }),
  }));
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: [job], error: null })
    .mockResolvedValueOnce({ data: true, error: null });
  return { from, rpc };
}

function providerWith(output: {
  resultType: "grounded_answer" | "insufficient_evidence";
  sourceKeys: string[];
}): DocumentChatProvider {
  return {
    answer: vi.fn().mockResolvedValue({
      provider: "synthetic-provider",
      modelIdentifier: "synthetic-chat-model",
      providerCallCount: 1,
      answer: { answer: "Synthetic chat response.", ...output },
    }),
  };
}

describe("document chat runner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses bounded same-conversation history and stores structured citations without excerpts", async () => {
    const admin = createAdmin();
    await expect(
      runDocumentChatBatch(1, {
        adminClient: admin as never,
        provider: providerWith({ resultType: "grounded_answer", sourceKeys: ["src_001"] }),
      }),
    ).resolves.toEqual({ processed: 1, completed: 1, failed: 0 });
    expect(admin.rpc).toHaveBeenNthCalledWith(1, "claim_next_document_chat_message", {
      worker_identity: expect.stringMatching(/^document-chat-worker-/),
    });
    expect(admin.rpc).toHaveBeenNthCalledWith(2, "complete_document_chat_message", {
      target_message_id: job.message_id,
      expected_worker_identity: expect.stringMatching(/^document-chat-worker-/),
      completed_content: "Synthetic chat response.",
      completed_result_type: "grounded_answer",
      completed_citations: [
        {
          reference_id: "source-1",
          page_id: "60000000-0000-4000-8000-000000000006",
          page_number: 1,
          chunk_id: "50000000-0000-4000-8000-000000000005",
          chunk_index: 0,
        },
      ],
      completed_source_coverage: "full",
      completed_source_item_count: 1,
      completed_source_character_count: "Synthetic source content.".length,
      completed_provider: "synthetic-provider",
      completed_model_identifier: "synthetic-chat-model",
      completed_provider_call_count: 1,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/en/documents/${job.document_id}/chat/${job.conversation_id}`,
    );
  });

  it("accepts an explicit insufficient-evidence fallback without citations", async () => {
    const admin = createAdmin();
    await expect(
      runDocumentChatBatch(1, {
        adminClient: admin as never,
        provider: providerWith({ resultType: "insufficient_evidence", sourceKeys: [] }),
      }),
    ).resolves.toEqual({ processed: 1, completed: 1, failed: 0 });
    expect(admin.rpc).toHaveBeenLastCalledWith(
      "complete_document_chat_message",
      expect.objectContaining({ completed_result_type: "insufficient_evidence", completed_citations: [] }),
    );
  });

  it("fails safely when a provider returns a source key outside the same-document selection", async () => {
    const admin = createAdmin();
    await expect(
      runDocumentChatBatch(1, {
        adminClient: admin as never,
        provider: providerWith({ resultType: "grounded_answer", sourceKeys: ["src_999"] }),
      }),
    ).resolves.toEqual({ processed: 1, completed: 0, failed: 1 });
    expect(admin.rpc).toHaveBeenNthCalledWith(2, "fail_document_chat_message", {
      target_message_id: job.message_id,
      expected_worker_identity: expect.any(String),
      safe_error_code: "source_validation_failed",
    });
  });
});
