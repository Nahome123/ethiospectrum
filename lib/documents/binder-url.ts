import { defaultDocumentBinderFilters, type DocumentBinderFilters } from "@/lib/validation/document-binder";

export function buildDocumentBinderSearchParams(filters: DocumentBinderFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search) params.set("q", filters.search);
  if (filters.householdLevel) params.set("dependent", "unassigned");
  else if (filters.dependentId) params.set("dependent", filters.dependentId);
  if (filters.category) params.set("category", filters.category);
  if (filters.mimeType) params.set("fileType", filters.mimeType);
  if (filters.uploadStatus) params.set("uploadStatus", filters.uploadStatus);
  if (filters.processingStatus) params.set("processingStatus", filters.processingStatus);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.sort !== defaultDocumentBinderFilters.sort) params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));

  return params;
}

export function buildDocumentBinderHref(
  locale: string,
  filters: DocumentBinderFilters,
  overrides: Partial<DocumentBinderFilters> = {},
): string {
  const next = { ...filters, ...overrides };
  const query = buildDocumentBinderSearchParams(next).toString();
  return `/${locale}/documents${query ? `?${query}` : ""}`;
}

export function getDocumentBinderClearHref(locale: string): string {
  return buildDocumentBinderHref(locale, defaultDocumentBinderFilters);
}
