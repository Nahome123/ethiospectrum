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

import { queueDocumentOcrAction } from "@/lib/documents/ocr-actions";

const documentId = "30000000-0000-4000-8000-000000000003";
const idle = { status: "idle", message: "" } as const;

function context(canProcess = true) {
  return {
    household: { id: "10000000-0000-4000-8000-000000000001", name: "Synthetic household" },
    userId: "20000000-0000-4000-8000-000000000002",
    permission: canProcess ? "member" : "viewer",
    canUpload: canProcess,
    canProcess,
  };
}

describe("document OCR queue action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getDocumentContext.mockResolvedValue(context());
  });

  it("rejects malformed identifiers before loading browser context", async () => {
    await expect(queueDocumentOcrAction("en", "not-a-uuid", idle)).resolves.toEqual({
      status: "error",
      message: "ocrFailed",
    });
    expect(mocks.getDocumentContext).not.toHaveBeenCalled();
  });

  it("denies viewers before invoking the OCR queue function", async () => {
    mocks.getDocumentContext.mockResolvedValue(context(false));
    await expect(queueDocumentOcrAction("am", documentId, idle)).resolves.toEqual({
      status: "error",
      message: "processingAccessDenied",
    });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("returns only localized queue state from the controlled database RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ job_id: "40000000-0000-4000-8000-000000000004", already_queued: false }],
      error: null,
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await expect(queueDocumentOcrAction("es", documentId, idle)).resolves.toEqual({
      status: "success",
      message: "ocrQueued",
    });
    expect(rpc).toHaveBeenCalledWith("queue_document_ocr", { target_document_id: documentId });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/es/documents/${documentId}`);
  });
});
