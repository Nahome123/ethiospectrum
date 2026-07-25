import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentSummaryProvider } from "@/lib/documents/summaries/types";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { runDocumentSummaryBatch } from "@/lib/documents/summaries/runner";

const job = {
  summary_id: "40000000-0000-4000-8000-000000000004",
  document_id: "30000000-0000-4000-8000-000000000003",
  household_id: "10000000-0000-4000-8000-000000000001",
  language: "en",
  prompt_version: "document-summary-v1",
  attempt_count: 1,
  max_attempts: 3,
};

const validSummary = {
  overview: { text: "Synthetic grounded overview.", sourceKeys: ["src_001"] },
  keyPoints: [],
  importantDates: [],
  actionItems: [],
  organizationsOrPeople: [],
  warningsOrUncertainties: [],
};

function selectBuilder(result: unknown, maybeSingle = false) {
  const builder = {
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
  };
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);
  return Object.assign(builder, {
    then: Promise.resolve(result).then.bind(Promise.resolve(result)),
    select: undefined,
    ...(maybeSingle ? {} : {}),
  });
}

function createAdmin() {
  const documentBuilder = selectBuilder(
    {
      data: {
        id: job.document_id,
        household_id: job.household_id,
        upload_status: "uploaded",
        processing_status: "completed",
        deleted_at: null,
      },
      error: null,
    },
    true,
  );
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
  const from = vi.fn((table: string) => {
    const builder =
      table === "documents" ? documentBuilder : table === "document_chunks" ? chunksBuilder : pagesBuilder;
    return { select: vi.fn(() => builder) };
  });
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: [job], error: null })
    .mockResolvedValueOnce({ data: true, error: null });
  return { from, rpc };
}

function providerWith(summary = validSummary, providerCallCount = 1): DocumentSummaryProvider {
  return {
    summarize: vi.fn().mockResolvedValue({
      provider: "synthetic-provider",
      modelIdentifier: "synthetic-summary-model",
      providerCallCount,
      structuredSummary: summary,
    }),
  };
}

describe("document summary runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses bounded, server-loaded sources and stores only validated structured output", async () => {
    const admin = createAdmin();

    await expect(
      runDocumentSummaryBatch(1, {
        adminClient: admin as never,
        provider: providerWith(),
      }),
    ).resolves.toEqual({ processed: 1, completed: 1, failed: 0 });

    expect(admin.rpc).toHaveBeenNthCalledWith(1, "claim_next_document_summary_job", {
      worker_identity: expect.stringMatching(/^document-summary-worker-/),
    });
    expect(admin.rpc).toHaveBeenNthCalledWith(2, "complete_document_summary_job", {
      target_summary_id: job.summary_id,
      expected_worker_identity: expect.stringMatching(/^document-summary-worker-/),
      completed_summary_text: "Synthetic grounded overview.",
      completed_source_coverage: "full",
      completed_source_item_count: 1,
      completed_source_character_count: "Synthetic source content.".length,
      completed_provider: "synthetic-provider",
      completed_model_identifier: "synthetic-summary-model",
      completed_provider_call_count: 2,
      completed_structured_summary: validSummary,
      completed_source_references: [
        {
          reference_id: "source-1",
          section: "overview",
          item_index: 0,
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

  it("fails a claimed job safely when a provider fabricates a source key", async () => {
    const admin = createAdmin();
    const fabricatedSummary = {
      ...validSummary,
      overview: { text: "Synthetic grounded overview.", sourceKeys: ["src_999"] },
    };

    await expect(
      runDocumentSummaryBatch(1, {
        adminClient: admin as never,
        provider: providerWith(fabricatedSummary),
      }),
    ).resolves.toEqual({ processed: 1, completed: 0, failed: 1 });

    expect(admin.rpc).toHaveBeenNthCalledWith(2, "fail_document_summary_job", {
      target_summary_id: job.summary_id,
      expected_worker_identity: expect.stringMatching(/^document-summary-worker-/),
      safe_error_code: "source_validation_failed",
    });
  });

  it("enforces the total provider invocation budget including retries", async () => {
    const admin = createAdmin();

    await expect(
      runDocumentSummaryBatch(1, {
        adminClient: admin as never,
        provider: providerWith(validSummary, 7),
      }),
    ).resolves.toEqual({ processed: 1, completed: 0, failed: 1 });

    expect(admin.rpc).toHaveBeenNthCalledWith(2, "fail_document_summary_job", {
      target_summary_id: job.summary_id,
      expected_worker_identity: expect.any(String),
      safe_error_code: "input_limit_exceeded",
    });
  });
});
