import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasValidDocumentSummarySecret: vi.fn(),
  runDocumentSummaryBatch: vi.fn(),
}));

vi.mock("@/lib/documents/summaries/internal-secret", () => ({
  hasValidDocumentSummarySecret: mocks.hasValidDocumentSummarySecret,
}));
vi.mock("@/lib/documents/summaries/runner", () => ({
  runDocumentSummaryBatch: mocks.runDocumentSummaryBatch,
}));

import { POST } from "@/app/api/internal/document-summaries/route";

describe("document summary internal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing secret before starting a worker batch", async () => {
    mocks.hasValidDocumentSummarySecret.mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost/api/internal/document-summaries", {
        method: "POST",
        body: JSON.stringify({ documentId: "30000000-0000-4000-8000-000000000003" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.hasValidDocumentSummarySecret).toHaveBeenCalledWith(null);
    expect(mocks.runDocumentSummaryBatch).not.toHaveBeenCalled();
  });

  it("runs the bounded worker without accepting caller-supplied identifiers", async () => {
    const result = { processed: 1, completed: 1, failed: 0 };
    mocks.hasValidDocumentSummarySecret.mockReturnValue(true);
    mocks.runDocumentSummaryBatch.mockResolvedValue(result);

    const response = await POST(
      new Request("http://localhost/api/internal/document-summaries", {
        method: "POST",
        headers: { "x-document-summary-secret": "correct-summary-secret" },
        body: JSON.stringify({ documentId: "30000000-0000-4000-8000-000000000003" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.runDocumentSummaryBatch).toHaveBeenCalledWith();
    await expect(response.json()).resolves.toEqual(result);
  });

  it("returns a static availability response instead of raw worker errors", async () => {
    mocks.hasValidDocumentSummarySecret.mockReturnValue(true);
    mocks.runDocumentSummaryBatch.mockRejectedValue(new Error("private provider response"));

    const response = await POST(
      new Request("http://localhost/api/internal/document-summaries", {
        method: "POST",
        headers: { "x-document-summary-secret": "correct-summary-secret" },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Document summaries are temporarily unavailable.",
    });
  });

  it("fails closed when server secret configuration is malformed", async () => {
    mocks.hasValidDocumentSummarySecret.mockImplementation(() => {
      throw new Error("invalid summary secret configuration");
    });

    const response = await POST(
      new Request("http://localhost/api/internal/document-summaries", {
        method: "POST",
        headers: { "x-document-summary-secret": "candidate" },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("");
    expect(mocks.runDocumentSummaryBatch).not.toHaveBeenCalled();
  });
});
