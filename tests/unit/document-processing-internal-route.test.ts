import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasValidDocumentProcessingSecret: vi.fn(),
  runDocumentProcessingBatch: vi.fn(),
}));

vi.mock("@/lib/documents/processing/internal-secret", () => ({
  hasValidDocumentProcessingSecret: mocks.hasValidDocumentProcessingSecret,
}));
vi.mock("@/lib/documents/processing/runner", () => ({
  runDocumentProcessingBatch: mocks.runDocumentProcessingBatch,
}));

import { POST } from "@/app/api/internal/document-processing/route";

describe("document processing internal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without the private worker secret before starting a batch", async () => {
    mocks.hasValidDocumentProcessingSecret.mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost/api/internal/document-processing", {
        method: "POST",
        body: JSON.stringify({ documentId: "30000000-0000-4000-8000-000000000003" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.hasValidDocumentProcessingSecret).toHaveBeenCalledWith(null);
    expect(mocks.runDocumentProcessingBatch).not.toHaveBeenCalled();
  });

  it("runs only the bounded batch worker and ignores caller-supplied document identifiers", async () => {
    const result = { processed: 1, completed: 1, unsupported: 0, needsOcr: 0, failed: 0 };
    mocks.hasValidDocumentProcessingSecret.mockReturnValue(true);
    mocks.runDocumentProcessingBatch.mockResolvedValue(result);

    const response = await POST(
      new Request("http://localhost/api/internal/document-processing", {
        method: "POST",
        headers: { "x-document-processing-secret": "correct-secret" },
        body: JSON.stringify({ documentId: "30000000-0000-4000-8000-000000000003" }),
      }),
    );

    expect(mocks.hasValidDocumentProcessingSecret).toHaveBeenCalledWith("correct-secret");
    expect(mocks.runDocumentProcessingBatch).toHaveBeenCalledWith();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
  });

  it("returns a static availability response instead of raw worker errors", async () => {
    mocks.hasValidDocumentProcessingSecret.mockReturnValue(true);
    mocks.runDocumentProcessingBatch.mockRejectedValue(new Error("private storage failure: path/secret"));

    const response = await POST(
      new Request("http://localhost/api/internal/document-processing", {
        method: "POST",
        headers: { "x-document-processing-secret": "correct-secret" },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Document processing is temporarily unavailable.",
    });
  });

  it("fails closed without exposing a malformed server secret configuration", async () => {
    mocks.hasValidDocumentProcessingSecret.mockImplementation(() => {
      throw new Error("invalid secret configuration");
    });

    const response = await POST(
      new Request("http://localhost/api/internal/document-processing", {
        method: "POST",
        headers: { "x-document-processing-secret": "candidate" },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("");
    expect(mocks.runDocumentProcessingBatch).not.toHaveBeenCalled();
  });
});
