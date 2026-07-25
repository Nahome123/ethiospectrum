import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentOcrProvider } from "@/lib/documents/ocr/types";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { runDocumentOcrBatch } from "@/lib/documents/ocr/runner";

const job = {
  attempt_count: 1,
  dependent_id: null,
  document_id: "30000000-0000-4000-8000-000000000003",
  file_size: 8,
  household_id: "10000000-0000-4000-8000-000000000001",
  job_id: "40000000-0000-4000-8000-000000000004",
  max_attempts: 3,
  mime_type: "application/pdf",
  original_filename: "scanned.pdf",
  storage_bucket: "family-documents",
  storage_path:
    "households/10000000-0000-4000-8000-000000000001/dependents/unassigned/documents/30000000-0000-4000-8000-000000000003/scanned.pdf",
};

function providerWith(text: string): DocumentOcrProvider {
  return {
    transcribePage: vi.fn().mockResolvedValue({
      provider: "openai",
      modelIdentifier: "synthetic-vision-model",
      text,
    }),
  };
}

async function* pageRenderer() {
  yield { pageNumber: 1, imageBytes: new Uint8Array([137, 80, 78, 71]), width: 10, height: 10 };
}

describe("document OCR runner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("downloads only the trusted private object and atomically submits ordered OCR pages and chunks", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [job], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const download = vi.fn().mockResolvedValue({ data: new Blob(["%PDF-1.4"]), error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc, storage: { from: vi.fn(() => ({ download })) } });

    await expect(
      runDocumentOcrBatch(1, {
        provider: providerWith("የተቃኘ ገጽ\nResumen familiar"),
        renderPages: pageRenderer,
      }),
    ).resolves.toEqual({ processed: 1, completed: 1, failed: 0 });

    expect(download).toHaveBeenCalledWith(job.storage_path);
    expect(rpc).toHaveBeenNthCalledWith(2, "complete_document_ocr_job", {
      target_job_id: job.job_id,
      expected_worker_identity: expect.stringMatching(/^document-ocr-/),
      completed_provider: "openai",
      completed_model_identifier: "synthetic-vision-model",
      page_rows: [
        {
          page_number: 1,
          content: "የተቃኘ ገጽ\nResumen familiar",
          character_count: "የተቃኘ ገጽ\nResumen familiar".length,
        },
      ],
      chunk_rows: [
        {
          page_number: 1,
          chunk_index: 0,
          content: "የተቃኘ ገጽ\nResumen familiar",
          character_count: "የተቃኘ ገጽ\nResumen familiar".length,
          token_estimate: 6,
        },
      ],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/en/documents/${job.document_id}`);
  });

  it("fails safely before download when a claimed job has an untrusted storage path", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ ...job, storage_path: "untrusted-path" }], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc, storage: { from: vi.fn() } });

    await expect(
      runDocumentOcrBatch(1, { provider: providerWith("ignored"), renderPages: pageRenderer }),
    ).resolves.toEqual({
      processed: 1,
      completed: 0,
      failed: 1,
    });

    expect(rpc).toHaveBeenNthCalledWith(2, "fail_document_ocr_job", {
      target_job_id: job.job_id,
      expected_worker_identity: expect.stringMatching(/^document-ocr-/),
      safe_error_code: "file_validation_failed",
    });
  });

  it("fails an OCR job when output is empty rather than storing fake text", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [job], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const download = vi.fn().mockResolvedValue({ data: new Blob(["%PDF-1.4"]), error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc, storage: { from: vi.fn(() => ({ download })) } });

    await expect(
      runDocumentOcrBatch(1, { provider: providerWith(" \n"), renderPages: pageRenderer }),
    ).resolves.toEqual({
      processed: 1,
      completed: 0,
      failed: 1,
    });

    expect(rpc).toHaveBeenNthCalledWith(2, "fail_document_ocr_job", {
      target_job_id: job.job_id,
      expected_worker_identity: expect.any(String),
      safe_error_code: "ocr_output_empty",
    });
  });
});
