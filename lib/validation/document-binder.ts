import { z } from "zod";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_PROCESSING_STATUSES,
  DOCUMENT_UPLOAD_STATUSES,
  type DocumentCategory,
  type DocumentMimeType,
  type DocumentProcessingStatus,
  type DocumentUploadStatus,
} from "@/lib/documents/constants";

export const DOCUMENT_BINDER_PAGE_SIZE = 12;
export const DOCUMENT_BINDER_SEARCH_MAX_LENGTH = 80;

export const DOCUMENT_BINDER_SORT_OPTIONS = ["newest", "oldest", "title_asc", "title_desc"] as const;

export type DocumentBinderSort = (typeof DOCUMENT_BINDER_SORT_OPTIONS)[number];

export type DocumentBinderSearchParams = Record<string, string | string[] | undefined>;

export type DocumentBinderFilters = {
  search: string;
  dependentId: string | null;
  householdLevel: boolean;
  category: DocumentCategory | null;
  mimeType: DocumentMimeType | null;
  uploadStatus: DocumentUploadStatus | null;
  processingStatus: DocumentProcessingStatus | null;
  from: string | null;
  to: string | null;
  sort: DocumentBinderSort;
  page: number;
};

export type DocumentBinderSortOrder = {
  primary: { column: "created_at" | "title"; ascending: boolean };
  secondary: { column: "id"; ascending: boolean };
};

export const defaultDocumentBinderFilters: DocumentBinderFilters = {
  search: "",
  dependentId: null,
  householdLevel: false,
  category: null,
  mimeType: null,
  uploadStatus: null,
  processingStatus: null,
  from: null,
  to: null,
  sort: "newest",
  page: 1,
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dependentIdSchema = z.string().uuid();
const categorySchema = z.enum(DOCUMENT_CATEGORIES);
const mimeTypeSchema = z.enum(DOCUMENT_MIME_TYPES);
const uploadStatusSchema = z.enum(DOCUMENT_UPLOAD_STATUSES);
const processingStatusSchema = z.enum(DOCUMENT_PROCESSING_STATUSES);
const sortSchema = z.enum(DOCUMENT_BINDER_SORT_OPTIONS);

const documentBinderSortOrders: Record<DocumentBinderSort, DocumentBinderSortOrder> = {
  newest: {
    primary: { column: "created_at", ascending: false },
    secondary: { column: "id", ascending: false },
  },
  oldest: {
    primary: { column: "created_at", ascending: true },
    secondary: { column: "id", ascending: true },
  },
  title_asc: {
    primary: { column: "title", ascending: true },
    secondary: { column: "id", ascending: true },
  },
  title_desc: {
    primary: { column: "title", ascending: false },
    secondary: { column: "id", ascending: false },
  },
};

function getSingleSearchParam(params: DocumentBinderSearchParams, name: string): string | null {
  const value = params[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function parseDate(value: string | null): string | null {
  if (!value || !datePattern.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.toISOString().slice(0, 10) === value ? value : null;
}

function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10_000 ? parsed : 1;
}

/**
 * Keeps URL search input out of PostgREST filter syntax. The query layer only
 * receives words made of Unicode letters and numbers, then adds its own fixed
 * wildcard and metadata-column syntax.
 */
export function normalizeDocumentBinderSearch(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.normalize("NFKC").trim();
  if (!trimmed || trimmed.length > DOCUMENT_BINDER_SEARCH_MAX_LENGTH) return "";
  return (trimmed.match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
}

export function createDocumentMetadataSearchFilter(search: string): string | null {
  const normalized = normalizeDocumentBinderSearch(search);
  if (!normalized) return null;
  const pattern = `*${normalized.split(" ").join("*")}*`;
  return ["title", "original_filename", "document_type"]
    .map((column) => `${column}.ilike.${pattern}`)
    .join(",");
}

export function getDocumentBinderSortOrder(sort: DocumentBinderSort): DocumentBinderSortOrder {
  return documentBinderSortOrders[sort];
}

export function parseDocumentBinderSearchParams(params: DocumentBinderSearchParams): DocumentBinderFilters {
  const dependent = getSingleSearchParam(params, "dependent");
  const dependentId = dependentIdSchema.safeParse(dependent).success ? dependent : null;
  const householdLevel = dependent === "unassigned";
  const rawFrom = getSingleSearchParam(params, "from");
  const rawTo = getSingleSearchParam(params, "to");
  const from = parseDate(rawFrom);
  const to = parseDate(rawTo);
  const validDateRange =
    (!rawFrom || from !== null) && (!rawTo || to !== null) && (!from || !to || from <= to);

  return {
    search: normalizeDocumentBinderSearch(getSingleSearchParam(params, "q")),
    dependentId: householdLevel ? null : dependentId,
    householdLevel,
    category: (() => {
      const parsed = categorySchema.safeParse(getSingleSearchParam(params, "category"));
      return parsed.success ? parsed.data : null;
    })(),
    mimeType: (() => {
      const parsed = mimeTypeSchema.safeParse(getSingleSearchParam(params, "fileType"));
      return parsed.success ? parsed.data : null;
    })(),
    uploadStatus: (() => {
      const parsed = uploadStatusSchema.safeParse(getSingleSearchParam(params, "uploadStatus"));
      return parsed.success ? parsed.data : null;
    })(),
    processingStatus: (() => {
      const parsed = processingStatusSchema.safeParse(getSingleSearchParam(params, "processingStatus"));
      return parsed.success ? parsed.data : null;
    })(),
    from: validDateRange ? from : null,
    to: validDateRange ? to : null,
    sort: (() => {
      const parsed = sortSchema.safeParse(getSingleSearchParam(params, "sort"));
      return parsed.success ? parsed.data : defaultDocumentBinderFilters.sort;
    })(),
    page: parsePage(getSingleSearchParam(params, "page")),
  };
}

export function getDocumentBinderRangeStart(page: number): number {
  return (page - 1) * DOCUMENT_BINDER_PAGE_SIZE;
}

export function getDocumentBinderDateStart(value: string): string {
  return `${value}T00:00:00.000Z`;
}

export function getDocumentBinderDateEndExclusive(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export function hasActiveDocumentBinderFilters(filters: DocumentBinderFilters): boolean {
  return Boolean(
    filters.search ||
    filters.dependentId ||
    filters.householdLevel ||
    filters.category ||
    filters.mimeType ||
    filters.uploadStatus ||
    filters.processingStatus ||
    filters.from ||
    filters.to ||
    filters.sort !== defaultDocumentBinderFilters.sort,
  );
}
