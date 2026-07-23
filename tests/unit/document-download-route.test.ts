import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRouteHandlerSupabaseClient: vi.fn(),
  getDocumentContext: vi.fn(),
}));

vi.mock("@/lib/supabase/route-handler", () => ({
  createRouteHandlerSupabaseClient: mocks.createRouteHandlerSupabaseClient,
}));
vi.mock("@/lib/documents/server", () => ({ getDocumentContext: mocks.getDocumentContext }));

import { GET } from "@/app/api/documents/[documentId]/download/route";

const householdId = "10000000-0000-4000-8000-000000000001";
const documentId = "30000000-0000-4000-8000-000000000003";
const storagePath = `households/${householdId}/dependents/unassigned/documents/${documentId}/school-report.pdf`;

function documentContext() {
  return {
    household: { id: householdId, name: "Test household" },
    userId: "20000000-0000-4000-8000-000000000002",
    permission: "member",
    canUpload: true,
  };
}

function queryChain<T>(result: { data: T | null; error: Error | null }) {
  const chain = {
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return chain;
}

function routeArgs(id = documentId) {
  return [
    new Request("http://localhost/api/documents/download"),
    { params: Promise.resolve({ documentId: id }) },
  ] as const;
}

describe("private document download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDocumentContext.mockResolvedValue(documentContext());
  });

  it("returns 404 before creating a database client when no household authorization exists", async () => {
    mocks.getDocumentContext.mockResolvedValue(null);

    const response = await GET(...routeArgs());

    expect(response.status).toBe(404);
    expect(mocks.createRouteHandlerSupabaseClient).not.toHaveBeenCalled();
  });

  it("denies archived or non-uploaded records without signing a storage URL", async () => {
    const documents = queryChain({ data: null, error: null });
    const createSignedUrl = vi.fn();
    const storageFrom = vi.fn(() => ({ createSignedUrl }));
    mocks.createRouteHandlerSupabaseClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => documents) })),
      storage: { from: storageFrom },
    });

    const response = await GET(...routeArgs());

    expect(response.status).toBe(404);
    expect(documents.eq).toHaveBeenNthCalledWith(1, "id", documentId);
    expect(documents.eq).toHaveBeenNthCalledWith(2, "household_id", householdId);
    expect(documents.eq).toHaveBeenNthCalledWith(3, "upload_status", "uploaded");
    expect(documents.is).toHaveBeenCalledWith("deleted_at", null);
    expect(storageFrom).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("redirects an authorized household request to a short-lived private signed download", async () => {
    const documents = queryChain({
      data: {
        storage_bucket: "family-documents",
        storage_path: storagePath,
        original_filename: "school-report.pdf",
      },
      error: null,
    });
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://storage.example.test/signed-document" },
      error: null,
    }));
    const storageFrom = vi.fn(() => ({ createSignedUrl }));
    mocks.createRouteHandlerSupabaseClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => documents) })),
      storage: { from: storageFrom },
    });

    const response = await GET(...routeArgs());

    expect(storageFrom).toHaveBeenCalledWith("family-documents");
    expect(createSignedUrl).toHaveBeenCalledWith(storagePath, 60, { download: "school-report.pdf" });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://storage.example.test/signed-document");
  });
});
