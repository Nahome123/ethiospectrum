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

import { queueDocumentProcessingAction } from "@/lib/documents/processing-actions";

const documentId = "30000000-0000-4000-8000-000000000003";
const idle = { status: "idle" } as const;

function permittedContext(canProcess = true) {
  return {
    household: { id: "10000000-0000-4000-8000-000000000001", name: "Synthetic household" },
    userId: "20000000-0000-4000-8000-000000000002",
    permission: canProcess ? "member" : "viewer",
    canUpload: canProcess,
    canProcess,
  };
}

describe("document processing queue action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getDocumentContext.mockResolvedValue(permittedContext());
  });

  it("rejects an invalid document identifier without loading a session or calling the database", async () => {
    await expect(queueDocumentProcessingAction("en", "not-a-uuid", idle)).resolves.toEqual({
      status: "error",
      message: "processingFailed",
    });

    expect(mocks.getDocumentContext).not.toHaveBeenCalled();
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("denies a viewer before calling the queue RPC", async () => {
    mocks.getDocumentContext.mockResolvedValue(permittedContext(false));

    await expect(queueDocumentProcessingAction("am", documentId, idle)).resolves.toEqual({
      status: "error",
      message: "processingAccessDenied",
    });

    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("returns a safe generic error when the controlled queue RPC rejects a document", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: new Error("private database implementation detail"),
    }));
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await expect(queueDocumentProcessingAction("es", documentId, idle)).resolves.toEqual({
      status: "error",
      message: "processingFailed",
    });

    expect(rpc).toHaveBeenCalledWith("queue_document_processing", { target_document_id: documentId });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("treats an existing active job as an idempotent queue result", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ job_id: "40000000-0000-4000-8000-000000000004", already_queued: true }],
      error: null,
    }));
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await expect(queueDocumentProcessingAction("en", documentId, idle)).resolves.toEqual({
      status: "success",
      message: "processingAlreadyQueued",
    });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/documents");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/en/documents/${documentId}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/dashboard");
  });

  it("reports a newly queued document without accepting browser-controlled worker values", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ job_id: "40000000-0000-4000-8000-000000000004", already_queued: false }],
      error: null,
    }));
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await expect(queueDocumentProcessingAction("en", documentId, idle)).resolves.toEqual({
      status: "success",
      message: "processingStarted",
    });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0]).toEqual(["queue_document_processing", { target_document_id: documentId }]);
  });
});
