import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  extractDocumentText: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/documents/processing/parsers", () => ({
  extractDocumentText: mocks.extractDocumentText,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { runDocumentProcessingBatch } from "@/lib/documents/processing/runner";

const claimedJob = {
  attempt_count: 1,
  dependent_id: null,
  document_id: "30000000-0000-4000-8000-000000000003",
  file_size: 512,
  household_id: "10000000-0000-4000-8000-000000000001",
  job_id: "40000000-0000-4000-8000-000000000004",
  max_attempts: 3,
  mime_type: "application/pdf",
  original_filename: "school-report.pdf",
  storage_bucket: "unexpected-bucket",
  storage_path: "untrusted-path",
};

describe("document processing runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records an expected processing failure before returning a failed batch result", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [claimedJob], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc });

    await expect(runDocumentProcessingBatch(1)).resolves.toEqual({
      processed: 1,
      completed: 0,
      unsupported: 0,
      needsOcr: 0,
      failed: 1,
    });

    expect(rpc).toHaveBeenNthCalledWith(2, "fail_document_processing_job", {
      target_job_id: claimedJob.job_id,
      expected_worker_identity: expect.stringMatching(/^document-processor-/),
      safe_error_code: "file_validation_failed",
    });
    expect(mocks.extractDocumentText).not.toHaveBeenCalled();
  });

  it("propagates a generic availability failure when it cannot record a failed job", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [claimedJob], error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc });

    await expect(runDocumentProcessingBatch(1)).rejects.toThrow(
      "Document processing worker could not record a job failure.",
    );

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
