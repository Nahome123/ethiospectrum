import "server-only";

import { DOCUMENT_ALLOWED_MIME_TYPES } from "@/lib/documents/constants";
import type { Database } from "@/lib/supabase/types";
import type { DocumentSummaryLanguage, DocumentSummaryStatus } from "./summaries/constants";
import { documentSummaryLanguageSchema } from "./summaries/schemas";
import {
  type DocumentSummaryStoredSourceReference,
  parseStoredDocumentSummary,
  parseStoredDocumentSummarySourceReferences,
} from "./summaries/storage";
import type { DocumentSummaryOutput } from "./summaries/types";
import {
  createServerComponentSupabaseClient,
  getCurrentHousehold,
  getCurrentSupabaseClaims,
} from "@/lib/supabase/server";

type HouseholdPermission = Database["public"]["Enums"]["household_permission"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

const uploadPermissions = new Set<HouseholdPermission>(["owner", "administrator", "member"]);
const archiveManagerPermissions = new Set<HouseholdPermission>(["owner", "administrator"]);

export type DocumentContext = {
  household: { id: string; name: string };
  userId: string;
  permission: HouseholdPermission;
  canUpload: boolean;
  canProcess: boolean;
};

export type DocumentProcessingDetails = {
  status: string;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  retryable: boolean;
};

export type DocumentSummaryDetails = {
  status: DocumentSummaryStatus;
  language: DocumentSummaryLanguage;
  retryable: boolean;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  sourceCoverage: "full" | "partial";
  structuredSummary: DocumentSummaryOutput | null;
  sourceReferences: readonly Pick<
    DocumentSummaryStoredSourceReference,
    "section" | "item_index" | "page_number" | "chunk_index" | "excerpt"
  >[];
};

export type DocumentSummaryEligibility = {
  canRequest: boolean;
  reason: "processing" | "ocr" | "unavailable" | null;
};

export type DocumentOcrDetails = {
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  retryable: boolean;
};

export async function getDocumentContext(): Promise<DocumentContext | null> {
  const claims = await getCurrentSupabaseClaims();
  const household = await getCurrentHousehold();
  if (!claims || typeof claims.sub !== "string" || !household) return null;

  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("household_members")
    .select("permission")
    .eq("household_id", household.id)
    .eq("user_id", claims.sub)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;

  return {
    household,
    userId: claims.sub,
    permission: data.permission,
    canUpload: uploadPermissions.has(data.permission),
    canProcess: uploadPermissions.has(data.permission),
  };
}

export function canArchiveDocument(context: DocumentContext, document: Pick<DocumentRow, "uploaded_by">) {
  return (
    archiveManagerPermissions.has(context.permission) ||
    (context.canUpload && document.uploaded_by === context.userId)
  );
}

/** Keeps member controls aligned with the database's safe queue eligibility. */
export function canQueueDocumentProcessing(
  context: DocumentContext,
  document: Pick<DocumentRow, "deleted_at" | "mime_type" | "processing_status" | "upload_status">,
  processingDetails: Pick<DocumentProcessingDetails, "retryable"> | null,
): boolean {
  if (
    !context.canProcess ||
    document.upload_status !== "uploaded" ||
    Boolean(document.deleted_at) ||
    !DOCUMENT_ALLOWED_MIME_TYPES.includes(document.mime_type)
  ) {
    return false;
  }

  if (document.processing_status === "not_started") return true;
  return document.processing_status === "failed" && processingDetails?.retryable === true;
}

/** OCR is restricted to an active, textless PDF and the same non-viewer roles. */
export function canQueueDocumentOcr(
  context: DocumentContext,
  document: Pick<DocumentRow, "deleted_at" | "mime_type" | "processing_status" | "upload_status">,
  ocrDetails: Pick<DocumentOcrDetails, "retryable" | "status"> | null,
): boolean {
  if (
    !context.canProcess ||
    document.upload_status !== "uploaded" ||
    document.deleted_at !== null ||
    document.mime_type !== "application/pdf" ||
    document.processing_status !== "needs_ocr"
  ) {
    return false;
  }
  return !ocrDetails || (ocrDetails.status === "failed" && ocrDetails.retryable);
}

/** Summary requests share the non-viewer household permission boundary with processing. */
export function canQueueDocumentSummary(
  context: DocumentContext,
  document: Pick<DocumentRow, "deleted_at" | "processing_status" | "upload_status">,
): boolean {
  return (
    context.canProcess &&
    document.upload_status === "uploaded" &&
    document.processing_status === "completed" &&
    document.deleted_at === null
  );
}

/**
 * Eligibility is determined from trusted document state and an RLS-protected
 * existence query. It deliberately never loads extracted text into the page.
 */
export async function getDocumentSummaryEligibility(
  context: DocumentContext,
  document: Pick<DocumentRow, "deleted_at" | "id" | "processing_status" | "upload_status">,
): Promise<DocumentSummaryEligibility> {
  if (document.processing_status === "needs_ocr") return { canRequest: false, reason: "ocr" };
  if (
    document.upload_status !== "uploaded" ||
    document.deleted_at !== null ||
    document.processing_status !== "completed"
  ) {
    return { canRequest: false, reason: "processing" };
  }

  const supabase = await createServerComponentSupabaseClient();
  const [pages, chunks] = await Promise.all([
    supabase
      .from("document_pages")
      .select("id", { count: "exact", head: true })
      .eq("document_id", document.id),
    supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", document.id),
  ]);
  if (pages.error || chunks.error || (pages.count ?? 0) + (chunks.count ?? 0) === 0) {
    return { canRequest: false, reason: "unavailable" };
  }
  return { canRequest: context.canProcess, reason: context.canProcess ? null : "unavailable" };
}

export async function getUploadDependents() {
  const context = await getDocumentContext();
  if (!context) return { context: null, dependents: [] };

  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("dependents")
    .select("id, first_name, preferred_name")
    .eq("household_id", context.household.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return { context, dependents: data ?? [] };
}

export async function getVisibleDocument(documentId: string) {
  const context = await getDocumentContext();
  if (!context) return null;

  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("documents")
    .select(
      "id, household_id, dependent_id, uploaded_by, title, original_filename, mime_type, file_size, document_type, processing_status, upload_status, created_at, deleted_at",
    )
    .eq("id", documentId)
    .eq("household_id", context.household.id)
    .maybeSingle();
  return data ? { context, document: data } : null;
}

export async function getDocumentDependentName(dependentId: string | null, householdId: string) {
  if (!dependentId) return null;
  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("dependents")
    .select("first_name, preferred_name")
    .eq("id", dependentId)
    .eq("household_id", householdId)
    .maybeSingle();
  return data ? data.preferred_name || data.first_name : null;
}

/** Reads only the job fields approved for a document detail page. */
export async function getDocumentProcessingDetails(
  documentId: string,
): Promise<DocumentProcessingDetails | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_document_processing_status", {
    target_document_id: documentId,
  });
  const processing = data?.[0];
  if (error || !processing) return null;
  return {
    status: processing.status,
    attemptCount: processing.attempt_count,
    startedAt: processing.started_at,
    completedAt: processing.completed_at,
    failedAt: processing.failed_at,
    retryable: processing.retryable,
  };
}

/** Reads only the reviewed, display-safe OCR lifecycle fields. */
export async function getDocumentOcrDetails(documentId: string): Promise<DocumentOcrDetails | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_document_ocr_status", {
    target_document_id: documentId,
  });
  const ocr = data?.[0];
  const status = ocr?.status;
  if (
    error ||
    !ocr ||
    (status !== "queued" &&
      status !== "processing" &&
      status !== "completed" &&
      status !== "failed" &&
      status !== "cancelled")
  ) {
    return null;
  }
  return {
    status,
    attemptCount: ocr.attempt_count,
    startedAt: ocr.started_at,
    completedAt: ocr.completed_at,
    failedAt: ocr.failed_at,
    retryable: ocr.retryable,
  };
}

/** Reads only reviewed, display-safe summary fields through summary RLS. */
export async function getDocumentSummaryDetails(
  documentId: string,
  language: DocumentSummaryLanguage,
): Promise<DocumentSummaryDetails | null> {
  const validLanguage = documentSummaryLanguageSchema.safeParse(language);
  if (!validLanguage.success) return null;

  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("document_summaries")
    .select(
      "language, status, requested_at, started_at, completed_at, failed_at, attempt_count, max_attempts, source_coverage, structured_summary, source_references",
    )
    .eq("document_id", documentId)
    .eq("language", validLanguage.data)
    .maybeSingle();
  if (error || !data) return null;

  const status = ["queued", "generating", "completed", "failed"].find((item) => item === data.status);
  const sourceCoverage =
    data.source_coverage === "partial" ? "partial" : data.source_coverage === "full" ? "full" : null;
  const sourceReferences = parseStoredDocumentSummarySourceReferences(data.source_references);
  if (!status || !sourceCoverage || !sourceReferences) return null;

  return {
    status: status as DocumentSummaryStatus,
    language: validLanguage.data,
    retryable: data.status === "failed" && data.attempt_count < data.max_attempts,
    requestedAt: data.requested_at,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    failedAt: data.failed_at,
    sourceCoverage,
    structuredSummary:
      data.status === "completed" ? parseStoredDocumentSummary(data.structured_summary) : null,
    sourceReferences: sourceReferences.map((reference) => ({
      section: reference.section,
      item_index: reference.item_index,
      page_number: reference.page_number,
      chunk_index: reference.chunk_index,
      excerpt: reference.excerpt,
    })),
  };
}
