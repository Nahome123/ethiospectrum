import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerActionSupabaseClient: vi.fn(),
  getDocumentContext: vi.fn(),
  getTranslations: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: mocks.createServerActionSupabaseClient,
}));
vi.mock("@/lib/documents/server", () => ({ getDocumentContext: mocks.getDocumentContext }));
vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  createDocumentChatConversationAction,
  retryDocumentChatResponseAction,
  sendDocumentChatMessageAction,
} from "@/lib/documents/chat-actions";

const documentId = "30000000-0000-4000-8000-000000000003";
const conversationId = "40000000-0000-4000-8000-000000000004";
const messageId = "50000000-0000-4000-8000-000000000005";
const idempotencyKey = "60000000-0000-4000-8000-000000000006";
const idle = { status: "idle" } as const;

function formData(message = "What is next?", language?: string) {
  const form = new FormData();
  form.set("message", message);
  form.set("idempotencyKey", idempotencyKey);
  if (language) form.set("language", language);
  return form;
}

function context(canProcess = true) {
  return {
    household: { id: "10000000-0000-4000-8000-000000000001", name: "Synthetic household" },
    userId: "20000000-0000-4000-8000-000000000002",
    permission: canProcess ? "member" : "viewer",
    canUpload: canProcess,
    canProcess,
  };
}

describe("document chat actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getDocumentContext.mockResolvedValue(context());
  });

  it("validates locale, IDs, messages, and idempotency keys before authorization", async () => {
    await expect(
      createDocumentChatConversationAction("en", "invalid", idle, formData("Question", "en")),
    ).resolves.toEqual({ status: "error", message: "unavailable" });
    await expect(
      sendDocumentChatMessageAction("en", documentId, conversationId, idle, formData(" ")),
    ).resolves.toEqual({ status: "error", message: "sendUnavailable" });
    expect(mocks.getDocumentContext).not.toHaveBeenCalled();
  });

  it("denies viewers before invoking chat mutation RPCs", async () => {
    mocks.getDocumentContext.mockResolvedValue(context(false));
    await expect(
      createDocumentChatConversationAction("en", documentId, idle, formData("Question", "en")),
    ).resolves.toEqual({ status: "error", message: "accessDenied" });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("sends only bounded user-controlled values and returns the protected conversation ID", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ conversation_id: conversationId, assistant_message_id: messageId, already_exists: false }],
      error: null,
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await expect(
      createDocumentChatConversationAction(
        "es",
        documentId,
        idle,
        formData("Â¿CuÃ¡l es el siguiente paso?", "es"),
      ),
    ).resolves.toEqual({ status: "success", message: "started", conversationId });
    expect(rpc).toHaveBeenCalledWith("create_document_chat_conversation", {
      target_document_id: documentId,
      requested_language: "es",
      initial_message_content: "Â¿CuÃ¡l es el siguiente paso?",
      requested_idempotency_key: idempotencyKey,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/es/documents/${documentId}/chat/${conversationId}`);
  });

  it("maps message and retry failures to localized safe errors", async () => {
    mocks.createServerActionSupabaseClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("private database error") }),
    });
    await expect(
      sendDocumentChatMessageAction(
        "am",
        documentId,
        conversationId,
        idle,
        formData("á‹¨áˆ°áŠá‹± á‹‹áŠ“ á¿á‹°áˆ­áŒŽ áŠá‹?"),
      ),
    ).resolves.toEqual({ status: "error", message: "sendUnavailable" });
    await expect(
      retryDocumentChatResponseAction("en", documentId, conversationId, messageId, idle, new FormData()),
    ).resolves.toEqual({ status: "error", message: "retryUnavailable" });
  });
});
