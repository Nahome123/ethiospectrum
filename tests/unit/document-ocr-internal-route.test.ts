import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasValidDocumentOcrSecret: vi.fn(),
  runDocumentOcrBatch: vi.fn(),
}));

vi.mock("@/lib/documents/ocr/internal-secret", () => ({
  hasValidDocumentOcrSecret: mocks.hasValidDocumentOcrSecret,
}));
vi.mock("@/lib/documents/ocr/runner", () => ({ runDocumentOcrBatch: mocks.runDocumentOcrBatch }));

import { POST } from "@/app/api/internal/document-ocr/route";

describe("document OCR internal route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a missing or incorrect worker secret before starting OCR", async () => {
    mocks.hasValidDocumentOcrSecret.mockReturnValue(false);
    const response = await POST(
      new Request("http://localhost/api/internal/document-ocr", {
        method: "POST",
        body: JSON.stringify({ documentId: "30000000-0000-4000-8000-000000000003" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.hasValidDocumentOcrSecret).toHaveBeenCalledWith(null);
    expect(mocks.runDocumentOcrBatch).not.toHaveBeenCalled();
  });

  it("runs only a bounded batch and returns aggregate counts", async () => {
    const result = { processed: 1, completed: 1, failed: 0 };
    mocks.hasValidDocumentOcrSecret.mockReturnValue(true);
    mocks.runDocumentOcrBatch.mockResolvedValue(result);
    const response = await POST(
      new Request("http://localhost/api/internal/document-ocr", {
        method: "POST",
        headers: { "x-document-ocr-secret": "correct-ocr-secret" },
        body: JSON.stringify({ documentId: "browser-controlled-value" }),
      }),
    );

    expect(mocks.runDocumentOcrBatch).toHaveBeenCalledWith();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
  });

  it("returns a generic response instead of a provider or document error", async () => {
    mocks.hasValidDocumentOcrSecret.mockReturnValue(true);
    mocks.runDocumentOcrBatch.mockRejectedValue(new Error("private document text and provider payload"));
    const response = await POST(
      new Request("http://localhost/api/internal/document-ocr", {
        method: "POST",
        headers: { "x-document-ocr-secret": "correct-ocr-secret" },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Document OCR is temporarily unavailable." });
  });
});
