"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { documentIdSchema } from "@/lib/validation/document";
import { documentSummaryLanguageSchema } from "./summaries/schemas";
import type { DocumentSummaryActionState } from "./summary-action-state";
import { getDocumentContext } from "./server";

function revalidateDocumentSummaryPaths(locale: AppLocale, documentId: string): void {
  revalidatePath(`/${locale}/documents`);
  revalidatePath(`/${locale}/documents/${documentId}`);
  revalidatePath(`/${locale}/dashboard`);
}

export async function requestDocumentSummaryAction(
  locale: AppLocale,
  documentId: string,
  _state: DocumentSummaryActionState,
  formData: FormData,
): Promise<DocumentSummaryActionState> {
  void _state;
  const t = await getTranslations({ locale, namespace: "documents" });
  const language = documentSummaryLanguageSchema.safeParse(formData.get("language"));
  if (!documentIdSchema.safeParse(documentId).success || !language.success) {
    return { status: "error", message: t("summaryUnavailable") };
  }

  const context = await getDocumentContext();
  if (!context?.canProcess) {
    return { status: "error", message: t("summaryAccessDenied") };
  }

  const supabase = await createServerActionSupabaseClient();
  const documentResult = await supabase
    .from("documents")
    .select("id, household_id, upload_status, processing_status, deleted_at")
    .eq("id", documentId)
    .eq("household_id", context.household.id)
    .maybeSingle();
  const document = documentResult.data;
  if (documentResult.error || !document) {
    return { status: "error", message: t("summaryUnavailable") };
  }
  if (document.processing_status === "needs_ocr") {
    return { status: "error", message: t("summaryOcrRequired") };
  }
  if (
    document.upload_status !== "uploaded" ||
    document.processing_status !== "completed" ||
    document.deleted_at !== null
  ) {
    return { status: "error", message: t("summaryProcessingRequired") };
  }

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
    return { status: "error", message: t("summaryUnavailable") };
  }

  const requested = await supabase.rpc("request_document_summary", {
    target_document_id: document.id,
    requested_language: language.data,
  });
  const summary = requested.data?.[0];
  if (requested.error || !summary) {
    return { status: "error", message: t("summaryUnavailable") };
  }

  revalidateDocumentSummaryPaths(locale, document.id);
  if (summary.reused_completed) return { status: "success", message: t("summaryAvailable") };
  if (summary.already_active) return { status: "success", message: t("summaryAlreadyQueued") };
  return { status: "success", message: t("summaryQueued") };
}
