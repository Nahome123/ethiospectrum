import { describe, expect, it } from "vitest";
import { buildDocumentBinderHref, buildDocumentBinderSearchParams } from "@/lib/documents/binder-url";
import {
  DOCUMENT_BINDER_SEARCH_MAX_LENGTH,
  createDocumentMetadataSearchFilter,
  getDocumentBinderRangeStart,
  getDocumentBinderSortOrder,
  parseDocumentBinderSearchParams,
} from "@/lib/validation/document-binder";

const dependentId = "20000000-0000-4000-8000-000000000002";

describe("document binder URL validation", () => {
  it("validates safe metadata search, filters, sorting, and pagination", () => {
    const filters = parseDocumentBinderSearchParams({
      q: "  School report.pdf  ",
      dependent: dependentId,
      category: "education",
      fileType: "application/pdf",
      uploadStatus: "uploaded",
      processingStatus: "not_started",
      from: "2026-07-01",
      to: "2026-07-22",
      sort: "title_asc",
      page: "2",
    });

    expect(filters).toMatchObject({
      search: "School report pdf",
      dependentId,
      householdLevel: false,
      category: "education",
      mimeType: "application/pdf",
      uploadStatus: "uploaded",
      processingStatus: "not_started",
      from: "2026-07-01",
      to: "2026-07-22",
      sort: "title_asc",
      page: 2,
    });
  });

  it("normalizes invalid page, sort, dependent, status, and date parameters safely", () => {
    for (const page of ["0", "-1", "1.5", "not-a-page", "10001"]) {
      expect(parseDocumentBinderSearchParams({ page }).page).toBe(1);
    }
    const filters = parseDocumentBinderSearchParams({
      dependent: "not-a-uuid",
      category: "financial",
      fileType: "image/png",
      uploadStatus: "complete",
      processingStatus: "unknown",
      sort: "storage_path",
      from: "2026-02-30",
      to: "2026-01-01",
    });

    expect(filters).toMatchObject({
      dependentId: null,
      householdLevel: false,
      category: null,
      mimeType: null,
      uploadStatus: null,
      processingStatus: null,
      sort: "newest",
      from: null,
      to: null,
    });
  });

  it("accepts the controlled processing lifecycle and rejects retired statuses", () => {
    for (const processingStatus of [
      "not_started",
      "queued",
      "processing",
      "completed",
      "failed",
      "unsupported",
      "needs_ocr",
    ]) {
      expect(parseDocumentBinderSearchParams({ processingStatus }).processingStatus).toBe(processingStatus);
    }

    expect(parseDocumentBinderSearchParams({ processingStatus: "ready" }).processingStatus).toBeNull();
    expect(parseDocumentBinderSearchParams({ processingStatus: "deleted" }).processingStatus).toBeNull();
  });

  it("uses the household-level sentinel without accepting a household identifier", () => {
    const filters = parseDocumentBinderSearchParams({
      dependent: "unassigned",
      householdId: "10000000-0000-4000-8000-000000000001",
    });

    expect(filters.householdLevel).toBe(true);
    expect(filters.dependentId).toBeNull();
    expect(buildDocumentBinderSearchParams(filters).has("householdId")).toBe(false);
  });

  it("caps search length and prevents raw PostgREST filter syntax from being interpolated", () => {
    expect(
      parseDocumentBinderSearchParams({ q: "x".repeat(DOCUMENT_BINDER_SEARCH_MAX_LENGTH + 1) }).search,
    ).toBe("");

    const filters = parseDocumentBinderSearchParams({ q: "report),upload_status.eq.archived" });
    const expression = createDocumentMetadataSearchFilter(filters.search);

    expect(filters.search).toBe("report upload status eq archived");
    expect(expression).toContain("title.ilike.*report*upload*status*eq*archived*");
    expect(expression).not.toContain("upload_status.eq");
    expect(expression).not.toContain(")");
  });

  it("maps each accepted sort to fixed database columns and deterministic IDs", () => {
    expect(getDocumentBinderSortOrder("newest")).toEqual({
      primary: { column: "created_at", ascending: false },
      secondary: { column: "id", ascending: false },
    });
    expect(getDocumentBinderSortOrder("oldest")).toEqual({
      primary: { column: "created_at", ascending: true },
      secondary: { column: "id", ascending: true },
    });
    expect(getDocumentBinderSortOrder("title_asc")).toEqual({
      primary: { column: "title", ascending: true },
      secondary: { column: "id", ascending: true },
    });
    expect(getDocumentBinderSortOrder("title_desc")).toEqual({
      primary: { column: "title", ascending: false },
      secondary: { column: "id", ascending: false },
    });
  });

  it("preserves valid URL state while resetting the page through the supplied override", () => {
    const filters = parseDocumentBinderSearchParams({
      q: "School report",
      dependent: dependentId,
      uploadStatus: "uploaded",
      sort: "oldest",
      page: "3",
    });

    expect(buildDocumentBinderHref("en", filters, { page: 1 })).toBe(
      `/en/documents?q=School+report&dependent=${dependentId}&uploadStatus=uploaded&sort=oldest`,
    );
    expect(getDocumentBinderRangeStart(3)).toBe(24);
  });
});
