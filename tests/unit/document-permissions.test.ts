import { describe, expect, it } from "vitest";
import { canArchiveDocument, canQueueDocumentProcessing, type DocumentContext } from "@/lib/documents/server";

const household = { id: "10000000-0000-0000-0000-000000000001", name: "Synthetic household" };
const uploaderId = "20000000-0000-0000-0000-000000000001";
const anotherUserId = "30000000-0000-0000-0000-000000000001";

function context(permission: DocumentContext["permission"], userId = anotherUserId): DocumentContext {
  return {
    household,
    userId,
    permission,
    canUpload: permission === "owner" || permission === "administrator" || permission === "member",
    canProcess: permission === "owner" || permission === "administrator" || permission === "member",
  };
}

describe("document archive permissions", () => {
  it("permits owners and household administrators to archive a household document", () => {
    const document = { uploaded_by: uploaderId };

    expect(canArchiveDocument(context("owner"), document)).toBe(true);
    expect(canArchiveDocument(context("administrator"), document)).toBe(true);
  });

  it("permits only the active non-viewer original uploader among ordinary members", () => {
    const document = { uploaded_by: uploaderId };

    expect(canArchiveDocument(context("member", uploaderId), document)).toBe(true);
    expect(canArchiveDocument(context("member", anotherUserId), document)).toBe(false);
    expect(canArchiveDocument(context("viewer", uploaderId), document)).toBe(false);
  });
});

describe("document processing control eligibility", () => {
  const processingDocument = {
    deleted_at: null,
    mime_type: "text/plain",
    processing_status: "not_started",
    upload_status: "uploaded" as const,
  };

  it("shows initial processing only for an active non-viewer and supported uploaded document", () => {
    expect(canQueueDocumentProcessing(context("member"), processingDocument, null)).toBe(true);
    expect(canQueueDocumentProcessing(context("viewer"), processingDocument, null)).toBe(false);
    expect(
      canQueueDocumentProcessing(
        context("member"),
        { ...processingDocument, mime_type: "application/unknown" },
        null,
      ),
    ).toBe(false);
    expect(
      canQueueDocumentProcessing(
        context("member"),
        { ...processingDocument, upload_status: "pending" },
        null,
      ),
    ).toBe(false);
    expect(
      canQueueDocumentProcessing(
        context("member"),
        { ...processingDocument, deleted_at: "2026-07-23T00:00:00Z" },
        null,
      ),
    ).toBe(false);
  });

  it("shows retry only for a failed job that the database reports as retryable", () => {
    const failedDocument = { ...processingDocument, processing_status: "failed" };

    expect(canQueueDocumentProcessing(context("member"), failedDocument, { retryable: true })).toBe(true);
    expect(canQueueDocumentProcessing(context("member"), failedDocument, { retryable: false })).toBe(false);
    expect(canQueueDocumentProcessing(context("member"), failedDocument, null)).toBe(false);
  });
});
