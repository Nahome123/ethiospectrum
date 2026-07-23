import { describe, expect, it } from "vitest";
import { canArchiveDocument, type DocumentContext } from "@/lib/documents/server";

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
