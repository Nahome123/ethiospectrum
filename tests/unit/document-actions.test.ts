import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerActionSupabaseClient: vi.fn(),
  getDocumentContext: vi.fn(),
  canArchiveDocument: vi.fn(),
  getTranslations: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: mocks.createServerActionSupabaseClient,
}));
vi.mock("@/lib/documents/server", () => ({
  getDocumentContext: mocks.getDocumentContext,
  canArchiveDocument: mocks.canArchiveDocument,
}));
vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  archiveDocumentAction,
  completeDocumentUploadAction,
  markDocumentUploadFailedAction,
  prepareDocumentUploadAction,
} from "@/lib/documents/actions";

const householdId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000002";
const documentId = "30000000-0000-4000-8000-000000000003";
const storagePath = `households/${householdId}/dependents/unassigned/documents/${documentId}/school-report.pdf`;
const idle = { status: "idle" } as const;

type QueryResult<T> = { data: T | null; error: Error | null };

function documentContext(overrides: Partial<{ canUpload: boolean; permission: string }> = {}) {
  return {
    household: { id: householdId, name: "Test household" },
    userId,
    permission: "member",
    canUpload: true,
    ...overrides,
  };
}

function queryChain<T>(result: QueryResult<T>) {
  const chain = {
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return chain;
}

function mutationChain<T>(result: QueryResult<T>) {
  const chain = {
    eq: vi.fn(),
    is: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
}

function insertChain<T>(result: QueryResult<T>) {
  const chain = {
    select: vi.fn(),
    single: vi.fn(async () => result),
  };
  chain.select.mockReturnValue(chain);
  return chain;
}

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function validUploadForm() {
  return formData({
    title: "School report",
    dependentId: "",
    documentType: "education",
    originalFilename: "School Report.pdf",
    mimeType: "application/pdf",
    fileSize: "1024",
  });
}

function pendingDocument() {
  return {
    id: documentId,
    household_id: householdId,
    uploaded_by: userId,
    storage_bucket: "family-documents",
    storage_path: storagePath,
    mime_type: "application/pdf",
    file_size: 1024,
    upload_status: "pending",
    deleted_at: null,
  };
}

function pendingDocumentClient({
  updateResult,
  objectResult = { data: { size: 1024, contentType: "application/pdf" }, error: null },
}: {
  updateResult: QueryResult<{ id: string }>;
  objectResult?: QueryResult<{ size?: number; contentType?: string }>;
}) {
  const query = queryChain({ data: pendingDocument(), error: null });
  const update = mutationChain(updateResult);
  const documents = {
    select: vi.fn(() => query),
    update: vi.fn(() => update),
  };
  const info = vi.fn(async () => objectResult);
  const storageFrom = vi.fn(() => ({ info }));
  return {
    client: {
      from: vi.fn(() => documents),
      storage: { from: storageFrom },
    },
    documents,
    info,
    query,
    storageFrom,
    update,
  };
}

describe("document upload actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getDocumentContext.mockResolvedValue(documentContext());
    mocks.canArchiveDocument.mockReturnValue(true);
  });

  it("refuses upload preparation for a household member without upload permission", async () => {
    mocks.getDocumentContext.mockResolvedValue(documentContext({ canUpload: false, permission: "viewer" }));

    await expect(prepareDocumentUploadAction("en", idle, validUploadForm())).resolves.toEqual({
      status: "error",
      message: "accessDenied",
    });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("marks a prepared record failed and returns a safe error when signed-upload creation fails", async () => {
    const insert = insertChain({ data: { id: documentId, storage_path: storagePath }, error: null });
    const failedUpdate = mutationChain({ data: null, error: null });
    const documents = {
      insert: vi.fn(() => insert),
      update: vi.fn(() => failedUpdate),
    };
    const createSignedUploadUrl = vi.fn(async () => ({
      data: null,
      error: new Error("private storage error"),
    }));
    const storageFrom = vi.fn(() => ({ createSignedUploadUrl }));
    mocks.createServerActionSupabaseClient.mockResolvedValue({
      from: vi.fn(() => documents),
      storage: { from: storageFrom },
    });

    await expect(prepareDocumentUploadAction("en", idle, validUploadForm())).resolves.toEqual({
      status: "error",
      message: "prepareError",
    });

    expect(documents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        household_id: householdId,
        uploaded_by: userId,
        original_filename: "school-report.pdf",
        storage_bucket: "family-documents",
        storage_path: "pending",
        upload_status: "pending",
      }),
    );
    expect(storageFrom).toHaveBeenCalledWith("family-documents");
    expect(createSignedUploadUrl).toHaveBeenCalledWith(storagePath, { upsert: false });
    expect(documents.update).toHaveBeenCalledWith({ upload_status: "failed" });
    expect(failedUpdate.eq).toHaveBeenNthCalledWith(1, "id", documentId);
    expect(failedUpdate.eq).toHaveBeenNthCalledWith(2, "household_id", householdId);
    expect(failedUpdate.eq).toHaveBeenNthCalledWith(3, "uploaded_by", userId);
    expect(failedUpdate.eq).toHaveBeenNthCalledWith(4, "upload_status", "pending");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("completes an upload only after metadata verification and an update that returns the document row", async () => {
    const fixture = pendingDocumentClient({ updateResult: { data: { id: documentId }, error: null } });
    mocks.createServerActionSupabaseClient.mockResolvedValue(fixture.client);

    await expect(completeDocumentUploadAction("en", documentId)).resolves.toEqual({
      status: "complete",
      documentId,
    });

    expect(fixture.storageFrom).toHaveBeenCalledWith("family-documents");
    expect(fixture.info).toHaveBeenCalledWith(storagePath);
    expect(fixture.documents.update).toHaveBeenCalledWith({ upload_status: "uploaded" });
    expect(fixture.update.eq).toHaveBeenNthCalledWith(1, "id", documentId);
    expect(fixture.update.eq).toHaveBeenNthCalledWith(2, "household_id", householdId);
    expect(fixture.update.eq).toHaveBeenNthCalledWith(3, "uploaded_by", userId);
    expect(fixture.update.eq).toHaveBeenNthCalledWith(4, "upload_status", "pending");
    expect(fixture.update.select).toHaveBeenCalledWith("id");
    expect(fixture.update.maybeSingle).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/documents");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/dashboard");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/en/documents/${documentId}`);
  });

  it("does not claim an upload completed when the guarded update returns no row", async () => {
    const fixture = pendingDocumentClient({ updateResult: { data: null, error: null } });
    mocks.createServerActionSupabaseClient.mockResolvedValue(fixture.client);

    await expect(completeDocumentUploadAction("en", documentId)).resolves.toEqual({
      status: "error",
      message: "uploadFailed",
    });

    expect(fixture.update.select).toHaveBeenCalledWith("id");
    expect(fixture.update.maybeSingle).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("marks a pending upload failed only after its guarded update returns a row", async () => {
    const fixture = pendingDocumentClient({ updateResult: { data: { id: documentId }, error: null } });
    mocks.createServerActionSupabaseClient.mockResolvedValue(fixture.client);

    await expect(markDocumentUploadFailedAction("en", documentId)).resolves.toEqual({
      status: "error",
      message: "uploadFailed",
    });

    expect(fixture.documents.update).toHaveBeenCalledWith({ upload_status: "failed" });
    expect(fixture.update.select).toHaveBeenCalledWith("id");
    expect(fixture.update.maybeSingle).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/documents");
  });

  it("does not revalidate a failed-upload state when its guarded update affects no row", async () => {
    const fixture = pendingDocumentClient({ updateResult: { data: null, error: null } });
    mocks.createServerActionSupabaseClient.mockResolvedValue(fixture.client);

    await expect(markDocumentUploadFailedAction("en", documentId)).resolves.toEqual({
      status: "error",
      message: "uploadFailed",
    });

    expect(fixture.update.maybeSingle).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("redirects only after an authorized archive update returns the archived row", async () => {
    const selectedDocument = {
      id: documentId,
      household_id: householdId,
      uploaded_by: userId,
      upload_status: "uploaded",
      deleted_at: null,
    };
    const query = queryChain({ data: selectedDocument, error: null });
    const archiveUpdate = mutationChain({ data: { id: documentId }, error: null });
    const documents = {
      select: vi.fn(() => query),
      update: vi.fn(() => archiveUpdate),
    };
    mocks.createServerActionSupabaseClient.mockResolvedValue({ from: vi.fn(() => documents) });

    await archiveDocumentAction("es", documentId, idle);

    expect(mocks.canArchiveDocument).toHaveBeenCalledWith(documentContext(), selectedDocument);
    expect(documents.update).toHaveBeenCalledWith(
      expect.objectContaining({ upload_status: "archived", deleted_at: expect.any(String) }),
    );
    expect(archiveUpdate.select).toHaveBeenCalledWith("id");
    expect(archiveUpdate.maybeSingle).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/es/documents");
    expect(mocks.redirect).toHaveBeenCalledWith("/es/documents");
  });

  it("does not redirect when an archive update is denied or races with another change", async () => {
    const selectedDocument = {
      id: documentId,
      household_id: householdId,
      uploaded_by: userId,
      upload_status: "uploaded",
      deleted_at: null,
    };
    const query = queryChain({ data: selectedDocument, error: null });
    const archiveUpdate = mutationChain({ data: null, error: null });
    const documents = {
      select: vi.fn(() => query),
      update: vi.fn(() => archiveUpdate),
    };
    mocks.createServerActionSupabaseClient.mockResolvedValue({ from: vi.fn(() => documents) });

    await expect(archiveDocumentAction("es", documentId, idle)).resolves.toEqual({
      status: "error",
      message: "archiveError",
    });

    expect(archiveUpdate.select).toHaveBeenCalledWith("id");
    expect(archiveUpdate.maybeSingle).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
