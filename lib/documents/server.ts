import "server-only";

import { DOCUMENT_ALLOWED_MIME_TYPES } from "@/lib/documents/constants";
import type { Database } from "@/lib/supabase/types";
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
  };
}
