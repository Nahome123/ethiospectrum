import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasValidDocumentQuestionSecret: vi.fn(),
  runDocumentQuestionBatch: vi.fn(),
}));

vi.mock("@/lib/documents/questions/internal-secret", () => ({
  hasValidDocumentQuestionSecret: mocks.hasValidDocumentQuestionSecret,
}));
vi.mock("@/lib/documents/questions/runner", () => ({
  runDocumentQuestionBatch: mocks.runDocumentQuestionBatch,
}));

import { POST } from "@/app/api/internal/document-questions/route";

describe("document question internal route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects missing authorization without starting the worker", async () => {
    mocks.hasValidDocumentQuestionSecret.mockReturnValue(false);
    const response = await POST(
      new Request("http://localhost/api/internal/document-questions", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(mocks.runDocumentQuestionBatch).not.toHaveBeenCalled();
  });

  it("runs a bounded aggregate-only worker and hides raw failures", async () => {
    mocks.hasValidDocumentQuestionSecret.mockReturnValue(true);
    mocks.runDocumentQuestionBatch.mockResolvedValue({ processed: 1, completed: 1, failed: 0 });
    const response = await POST(
      new Request("http://localhost/api/internal/document-questions", {
        method: "POST",
        headers: { "x-document-question-secret": "correct-question-secret" },
        body: JSON.stringify({ documentId: "ignored-by-route" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.runDocumentQuestionBatch).toHaveBeenCalledWith();
    await expect(response.json()).resolves.toEqual({ processed: 1, completed: 1, failed: 0 });

    mocks.runDocumentQuestionBatch.mockRejectedValueOnce(new Error("private provider response"));
    const unavailable = await POST(
      new Request("http://localhost/api/internal/document-questions", {
        method: "POST",
        headers: { "x-document-question-secret": "correct-question-secret" },
      }),
    );
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: "Document questions are temporarily unavailable.",
    });
  });
});
