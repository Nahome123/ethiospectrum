import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hasValidDocumentQuestionSecret: vi.fn(), runDocumentChatBatch: vi.fn() }));
vi.mock("@/lib/documents/questions/internal-secret", () => ({
  hasValidDocumentQuestionSecret: mocks.hasValidDocumentQuestionSecret,
}));
vi.mock("@/lib/documents/chat/runner", () => ({ runDocumentChatBatch: mocks.runDocumentChatBatch }));

import { POST } from "@/app/api/internal/document-chats/route";

describe("document chat internal route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reuses the question worker secret and does not accept chat payloads", async () => {
    mocks.hasValidDocumentQuestionSecret.mockReturnValue(false);
    const rejected = await POST(
      new Request("http://localhost/api/internal/document-chats", { method: "POST" }),
    );
    expect(rejected.status).toBe(401);
    expect(mocks.runDocumentChatBatch).not.toHaveBeenCalled();

    mocks.hasValidDocumentQuestionSecret.mockReturnValue(true);
    mocks.runDocumentChatBatch.mockResolvedValue({ processed: 1, completed: 1, failed: 0 });
    const accepted = await POST(
      new Request("http://localhost/api/internal/document-chats", {
        method: "POST",
        headers: { "x-document-question-secret": "synthetic-secret" },
        body: JSON.stringify({ conversationId: "ignored" }),
      }),
    );
    expect(accepted.status).toBe(200);
    expect(mocks.runDocumentChatBatch).toHaveBeenCalledWith();
    await expect(accepted.json()).resolves.toEqual({ processed: 1, completed: 1, failed: 0 });
  });
});
