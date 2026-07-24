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

import { requestDocumentSummaryAction } from "@/lib/documents/summary-actions";

const documentId = "30000000-0000-4000-8000-000000000003";
const idle = { status: "idle" } as const;

function formData(language: string) {
  const form = new FormData();
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

function createEligibleClient({
  rpcResult = { data: [{ reused_completed: false, already_active: false }], error: null },
}: {
  rpcResult?: { data: { reused_completed: boolean; already_active: boolean }[] | null; error: Error | null };
} = {}) {
  const documentQuery = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: documentId,
              household_id: "10000000-0000-4000-8000-000000000001",
              upload_status: "uploaded",
              processing_status: "completed",
              deleted_at: null,
            },
            error: null,
          }),
        })),
      })),
    })),
  };
  const contentQuery = {
    select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ count: 1, error: null }) })),
  };
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return {
    from: vi
      .fn()
      .mockReturnValueOnce(documentQuery)
      .mockReturnValueOnce(contentQuery)
      .mockReturnValueOnce(contentQuery),
    rpc,
  };
}

describe("document summary request action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getDocumentContext.mockResolvedValue(permittedContext());
  });

  it("rejects invalid document or language input before loading a session", async () => {
    await expect(requestDocumentSummaryAction("en", "not-a-uuid", idle, formData("en"))).resolves.toEqual({
      status: "error",
      message: "summaryUnavailable",
    });
    await expect(
      requestDocumentSummaryAction("en", documentId, idle, formData("untrusted")),
    ).resolves.toEqual({
      status: "error",
      message: "summaryUnavailable",
    });

    expect(mocks.getDocumentContext).not.toHaveBeenCalled();
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("denies a viewer before accessing document or summary RPCs", async () => {
    mocks.getDocumentContext.mockResolvedValue(permittedContext(false));

    await expect(requestDocumentSummaryAction("am", documentId, idle, formData("am"))).resolves.toEqual({
      status: "error",
      message: "summaryAccessDenied",
    });

    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("sends only the trusted document ID and controlled language to the atomic request RPC", async () => {
    const client = createEligibleClient();
    mocks.createServerActionSupabaseClient.mockResolvedValue(client);

    await expect(requestDocumentSummaryAction("es", documentId, idle, formData("es"))).resolves.toEqual({
      status: "success",
      message: "summaryQueued",
    });

    expect(client.rpc).toHaveBeenCalledWith("request_document_summary", {
      target_document_id: documentId,
      requested_language: "es",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/es/documents/${documentId}`);
  });

  it("treats an active job and a completed summary as safe idempotent results", async () => {
    const activeClient = createEligibleClient({
      rpcResult: { data: [{ reused_completed: false, already_active: true }], error: null },
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue(activeClient);
    await expect(requestDocumentSummaryAction("en", documentId, idle, formData("en"))).resolves.toEqual({
      status: "success",
      message: "summaryAlreadyQueued",
    });

    const completedClient = createEligibleClient({
      rpcResult: { data: [{ reused_completed: true, already_active: false }], error: null },
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue(completedClient);
    await expect(requestDocumentSummaryAction("en", documentId, idle, formData("en"))).resolves.toEqual({
      status: "success",
      message: "summaryAvailable",
    });
  });

  it("does not expose database errors", async () => {
    const client = createEligibleClient({
      rpcResult: { data: null, error: new Error("private database failure") },
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue(client);

    await expect(requestDocumentSummaryAction("en", documentId, idle, formData("en"))).resolves.toEqual({
      status: "error",
      message: "summaryUnavailable",
    });
  });
});
