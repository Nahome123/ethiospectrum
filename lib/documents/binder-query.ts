import "server-only";

import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import {
  DOCUMENT_BINDER_PAGE_SIZE,
  createDocumentMetadataSearchFilter,
  getDocumentBinderDateEndExclusive,
  getDocumentBinderDateStart,
  getDocumentBinderRangeStart,
  getDocumentBinderSortOrder,
  type DocumentBinderFilters,
} from "@/lib/validation/document-binder";
import { canArchiveDocument, getDocumentContext, type DocumentContext } from "./server";

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type DocumentBinderRow = Pick<
  DocumentRow,
  | "id"
  | "dependent_id"
  | "uploaded_by"
  | "title"
  | "original_filename"
  | "mime_type"
  | "file_size"
  | "document_type"
  | "processing_status"
  | "upload_status"
  | "created_at"
  | "deleted_at"
>;

type DependentOption = Pick<
  Database["public"]["Tables"]["dependents"]["Row"],
  "id" | "first_name" | "preferred_name"
>;

export type DocumentBinderDependent = {
  id: string;
  name: string;
};

export type DocumentBinderDocument = DocumentBinderRow & {
  dependentName: string | null;
  canArchive: boolean;
};

export type DocumentBinderPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type DocumentBinderResult = {
  context: DocumentContext | null;
  dependents: DocumentBinderDependent[];
  documents: DocumentBinderDocument[];
  filters: DocumentBinderFilters;
  pagination: DocumentBinderPagination;
  hasError: boolean;
};

export type DocumentDashboardSummary = {
  context: DocumentContext | null;
  activeCount: number;
  pendingCount: number;
  failedCount: number;
  awaitingProcessingCount: number;
  processingCount: number;
  completedCount: number;
  processingFailedCount: number;
  unsupportedCount: number;
  needsOcrCount: number;
  recentDocuments: Pick<DocumentRow, "id" | "title">[];
};

const documentBinderColumns =
  "id, dependent_id, uploaded_by, title, original_filename, mime_type, file_size, document_type, processing_status, upload_status, created_at, deleted_at";

function emptyPagination(page = 1): DocumentBinderPagination {
  return {
    page,
    pageSize: DOCUMENT_BINDER_PAGE_SIZE,
    totalCount: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  };
}

function dependentName(dependent: DependentOption): string {
  return dependent.preferred_name || dependent.first_name;
}

function normalizeFiltersForHousehold(
  filters: DocumentBinderFilters,
  activeDependents: readonly DependentOption[],
): DocumentBinderFilters {
  if (!filters.dependentId || activeDependents.some((dependent) => dependent.id === filters.dependentId)) {
    return filters;
  }
  return { ...filters, dependentId: null };
}

export async function getDocumentBinder(filters: DocumentBinderFilters): Promise<DocumentBinderResult> {
  const context = await getDocumentContext();
  if (!context) {
    return {
      context: null,
      dependents: [],
      documents: [],
      filters,
      pagination: emptyPagination(filters.page),
      hasError: false,
    };
  }

  const supabase = await createServerComponentSupabaseClient();
  const activeDependentsResult = await supabase
    .from("dependents")
    .select("id, first_name, preferred_name")
    .eq("household_id", context.household.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (activeDependentsResult.error) {
    return {
      context,
      dependents: [],
      documents: [],
      filters,
      pagination: emptyPagination(filters.page),
      hasError: true,
    };
  }

  const activeDependents = (activeDependentsResult.data ?? []) as DependentOption[];
  const effectiveFilters = normalizeFiltersForHousehold(filters, activeDependents);
  const runPageQuery = async (page: number) => {
    let query = supabase
      .from("documents")
      .select(documentBinderColumns, { count: "exact" })
      .eq("household_id", context.household.id);

    if (effectiveFilters.uploadStatus === "archived") {
      query = query.eq("upload_status", "archived");
    } else {
      query = query.is("deleted_at", null);
      if (effectiveFilters.uploadStatus) query = query.eq("upload_status", effectiveFilters.uploadStatus);
    }
    if (effectiveFilters.dependentId) query = query.eq("dependent_id", effectiveFilters.dependentId);
    if (effectiveFilters.householdLevel) query = query.is("dependent_id", null);
    if (effectiveFilters.category) query = query.eq("document_type", effectiveFilters.category);
    if (effectiveFilters.mimeType) query = query.eq("mime_type", effectiveFilters.mimeType);
    if (effectiveFilters.processingStatus) {
      query = query.eq("processing_status", effectiveFilters.processingStatus);
    }
    if (effectiveFilters.from)
      query = query.gte("created_at", getDocumentBinderDateStart(effectiveFilters.from));
    if (effectiveFilters.to)
      query = query.lt("created_at", getDocumentBinderDateEndExclusive(effectiveFilters.to));

    const metadataSearch = createDocumentMetadataSearchFilter(effectiveFilters.search);
    if (metadataSearch) query = query.or(metadataSearch);

    const sort = getDocumentBinderSortOrder(effectiveFilters.sort);
    const rangeStart = getDocumentBinderRangeStart(page);
    return query
      .order(sort.primary.column, { ascending: sort.primary.ascending })
      .order(sort.secondary.column, { ascending: sort.secondary.ascending })
      .range(rangeStart, rangeStart + DOCUMENT_BINDER_PAGE_SIZE - 1);
  };

  let pageResult = await runPageQuery(effectiveFilters.page);
  if (pageResult.error) {
    return {
      context,
      dependents: activeDependents.map((dependent) => ({ id: dependent.id, name: dependentName(dependent) })),
      documents: [],
      filters: effectiveFilters,
      pagination: emptyPagination(effectiveFilters.page),
      hasError: true,
    };
  }

  const totalCount = pageResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / DOCUMENT_BINDER_PAGE_SIZE));
  const page = Math.min(effectiveFilters.page, totalPages);
  if (page !== effectiveFilters.page) pageResult = await runPageQuery(page);
  if (pageResult.error) {
    return {
      context,
      dependents: activeDependents.map((dependent) => ({ id: dependent.id, name: dependentName(dependent) })),
      documents: [],
      filters: { ...effectiveFilters, page },
      pagination: emptyPagination(page),
      hasError: true,
    };
  }

  const rows = (pageResult.data ?? []) as DocumentBinderRow[];
  const names = new Map(activeDependents.map((dependent) => [dependent.id, dependentName(dependent)]));
  const unresolvedDependentIds = [
    ...new Set(
      rows
        .map((document) => document.dependent_id)
        .filter((dependentId): dependentId is string => Boolean(dependentId && !names.has(dependentId))),
    ),
  ];
  if (unresolvedDependentIds.length) {
    const dependentNamesResult = await supabase
      .from("dependents")
      .select("id, first_name, preferred_name")
      .eq("household_id", context.household.id)
      .in("id", unresolvedDependentIds);
    for (const dependent of (dependentNamesResult.data ?? []) as DependentOption[]) {
      names.set(dependent.id, dependentName(dependent));
    }
  }

  return {
    context,
    dependents: activeDependents.map((dependent) => ({ id: dependent.id, name: dependentName(dependent) })),
    documents: rows.map((document) => ({
      ...document,
      dependentName: document.dependent_id ? (names.get(document.dependent_id) ?? null) : null,
      canArchive:
        !document.deleted_at &&
        document.upload_status !== "archived" &&
        canArchiveDocument(context, document),
    })),
    filters: { ...effectiveFilters, page },
    pagination: {
      page,
      pageSize: DOCUMENT_BINDER_PAGE_SIZE,
      totalCount,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
    hasError: false,
  };
}

export async function getDocumentDashboardSummary(): Promise<DocumentDashboardSummary> {
  const context = await getDocumentContext();
  if (!context) {
    return {
      context: null,
      activeCount: 0,
      pendingCount: 0,
      failedCount: 0,
      awaitingProcessingCount: 0,
      processingCount: 0,
      completedCount: 0,
      processingFailedCount: 0,
      unsupportedCount: 0,
      needsOcrCount: 0,
      recentDocuments: [],
    };
  }

  const supabase = await createServerComponentSupabaseClient();
  const [
    recentResult,
    activeCountResult,
    pendingCountResult,
    failedCountResult,
    awaitingProcessingCountResult,
    processingCountResult,
    completedCountResult,
    processingFailedCountResult,
    unsupportedCountResult,
    needsOcrCountResult,
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title")
      .eq("household_id", context.household.id)
      .eq("upload_status", "uploaded")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("household_id", context.household.id)
      .eq("upload_status", "uploaded")
      .is("deleted_at", null),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("household_id", context.household.id)
      .eq("upload_status", "pending")
      .is("deleted_at", null),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("household_id", context.household.id)
      .eq("upload_status", "failed")
      .is("deleted_at", null),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("household_id", context.household.id)
      .eq("upload_status", "uploaded")
      .is("deleted_at", null)
      .in("processing_status", ["not_started", "queued"]),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("household_id", context.household.id)
      .eq("upload_status", "uploaded")
      .is("deleted_at", null)
      .eq("processing_status", "processing"),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("household_id", context.household.id)
      .eq("upload_status", "uploaded")
      .is("deleted_at", null)
      .eq("processing_status", "completed"),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("household_id", context.household.id)
      .eq("upload_status", "uploaded")
      .is("deleted_at", null)
      .eq("processing_status", "failed"),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("household_id", context.household.id)
      .eq("upload_status", "uploaded")
      .is("deleted_at", null)
      .eq("processing_status", "unsupported"),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("household_id", context.household.id)
      .eq("upload_status", "uploaded")
      .is("deleted_at", null)
      .eq("processing_status", "needs_ocr"),
  ]);

  return {
    context,
    activeCount: activeCountResult.error ? 0 : (activeCountResult.count ?? 0),
    pendingCount: pendingCountResult.error ? 0 : (pendingCountResult.count ?? 0),
    failedCount: failedCountResult.error ? 0 : (failedCountResult.count ?? 0),
    awaitingProcessingCount: awaitingProcessingCountResult.error
      ? 0
      : (awaitingProcessingCountResult.count ?? 0),
    processingCount: processingCountResult.error ? 0 : (processingCountResult.count ?? 0),
    completedCount: completedCountResult.error ? 0 : (completedCountResult.count ?? 0),
    processingFailedCount: processingFailedCountResult.error ? 0 : (processingFailedCountResult.count ?? 0),
    unsupportedCount: unsupportedCountResult.error ? 0 : (unsupportedCountResult.count ?? 0),
    needsOcrCount: needsOcrCountResult.error ? 0 : (needsOcrCountResult.count ?? 0),
    recentDocuments: recentResult.error ? [] : (recentResult.data ?? []),
  };
}
