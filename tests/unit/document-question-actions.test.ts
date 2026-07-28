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

import { requestDocumentQuestionAction } from "@/lib/documents/question-actions";

const documentId = "30000000-0000-4000-8000-000000000003";
const idle = { status: "idle" } as const;

function formData(question = "What is the deadline?", language = "en") {
  const form = new FormData();
  form.set("question", question);
  form.set("language", language);
  return form;
}

function permittedContext(canProcess = true) {
  return {
    household: { id: "10000000-0000-4000-8000-000000000001", name: "Synthetic household" },
    userId: "20000000-0000-4000-8000-000000000002",
    permission: canProcess ? "member" : "viewer",
    canUpload: canProcess,
    canProcess,
  };
}

describe("document question request action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getDocumentContext.mockResolvedValue(permittedContext());
  });

  it("rejects invalid browser input before reading authorization", async () => {
    await expect(requestDocumentQuestionAction("en", "not-a-uuid", idle, formData())).resolves.toEqual({
      status: "error",
      message: "questionUnavailable",
    });
    await expect(
      requestDocumentQuestionAction("en", documentId, idle, formData("", "untrusted")),
    ).resolves.toEqual({ status: "error", message: "questionUnavailable" });
    expect(mocks.getDocumentContext).not.toHaveBeenCalled();
  });

  it("denies viewers before invoking the RPC", async () => {
    mocks.getDocumentContext.mockResolvedValue(permittedContext(false));
    await expect(requestDocumentQuestionAction("en", documentId, idle, formData())).resolves.toEqual({
      status: "error",
      message: "questionAccessDenied",
    });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("sends only the controlled document, language, and question fields to PostgreSQL", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ reused_completed: false, already_active: false }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await expect(
      requestDocumentQuestionAction("es", documentId, idle, formData("¿Cuál es la fecha?", "es")),
    ).resolves.toEqual({
      status: "success",
      message: "questionQueued",
    });
    expect(rpc).toHaveBeenCalledWith("request_document_question", {
      target_document_id: documentId,
      requested_language: "es",
      requested_question: "¿Cuál es la fecha?",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/es/documents/${documentId}`);
  });

  it("treats active and completed duplicate submissions as safe idempotent results", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ reused_completed: false, already_active: true }], error: null })
      .mockResolvedValueOnce({ data: [{ reused_completed: true, already_active: false }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await expect(requestDocumentQuestionAction("en", documentId, idle, formData())).resolves.toEqual({
      status: "success",
      message: "questionAlreadyQueued",
    });
    await expect(requestDocumentQuestionAction("en", documentId, idle, formData())).resolves.toEqual({
      status: "success",
      message: "answerAvailable",
    });
  });

  it("does not expose raw database failures", async () => {
    mocks.createServerActionSupabaseClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("private database failure") }),
    });
    await expect(
      requestDocumentQuestionAction("am", documentId, idle, formData("የመጨረሻ ቀን መቼ ነው?", "am")),
    ).resolves.toEqual({
      status: "error",
      message: "questionUnavailable",
    });
  });
});
