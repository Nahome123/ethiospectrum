"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDocumentContext } from "@/lib/documents/server";
import { documentSummaryLanguageSchema } from "@/lib/documents/summaries/schemas";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { documentIdSchema } from "@/lib/validation/document";
import type { DocumentSummaryQualityActionState } from "./summary-quality-action-state";
import { documentSummaryReviewSubmissionSchema } from "./summary-quality-schemas";

function revalidateSummaryQualityPaths(locale: AppLocale, documentId: string): void {
  revalidatePath(`/${locale}/documents`);
  revalidatePath(`/${locale}/documents/${documentId}`);
  revalidatePath(`/${locale}/dashboard`);
}

function toNullableRating(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

export async function evaluateDocumentSummaryAction(
  locale: AppLocale,
  documentId: string,
  language: string,
  _state: DocumentSummaryQualityActionState,
  _formData: FormData,
): Promise<DocumentSummaryQualityActionState> {
  void _state;
  void _formData;
  const t = await getTranslations({ locale, namespace: "documents" });
  const parsedLanguage = documentSummaryLanguageSchema.safeParse(language);
  if (!documentIdSchema.safeParse(documentId).success || !parsedLanguage.success) {
    return { status: "error", message: t("summaryQualityUnavailable") };
  }
  const context = await getDocumentContext();
  if (!context?.canProcess) return { status: "error", message: t("summaryQualityAccessDenied") };

  const supabase = await createServerActionSupabaseClient();
  const result = await supabase.rpc("evaluate_document_summary", {
    target_document_id: documentId,
    requested_language: parsedLanguage.data,
  });
  if (result.error || result.data !== true)
    return { status: "error", message: t("summaryQualityUnavailable") };
  revalidateSummaryQualityPaths(locale, documentId);
  return { status: "success", message: t("summaryQualityCompleted") };
}

export async function submitDocumentSummaryReviewAction(
  locale: AppLocale,
  documentId: string,
  language: string,
  _state: DocumentSummaryQualityActionState,
  formData: FormData,
): Promise<DocumentSummaryQualityActionState> {
  void _state;
  const t = await getTranslations({ locale, namespace: "documents" });
  const parsedLanguage = documentSummaryLanguageSchema.safeParse(language);
  if (!documentIdSchema.safeParse(documentId).success || !parsedLanguage.success) {
    return { status: "error", message: t("summaryReviewUnavailable") };
  }
  const input = documentSummaryReviewSubmissionSchema.safeParse({
    overallRating: toNullableRating(formData.get("overallRating")),
    accuracyRating: toNullableRating(formData.get("accuracyRating")),
    completenessRating: toNullableRating(formData.get("completenessRating")),
    citationRating: toNullableRating(formData.get("citationRating")),
    languageRating: toNullableRating(formData.get("languageRating")),
    issueCategories: formData.getAll("issueCategories"),
    feedback: typeof formData.get("feedback") === "string" ? formData.get("feedback") : null,
    decision:
      typeof formData.get("decision") === "string" && formData.get("decision") !== ""
        ? formData.get("decision")
        : null,
  });
  if (!input.success) return { status: "error", message: t("summaryReviewValidationError") };

  const context = await getDocumentContext();
  if (!context?.canProcess) return { status: "error", message: t("summaryReviewAccessDenied") };
  if (input.data.decision !== null && !["owner", "administrator"].includes(context.permission)) {
    return { status: "error", message: t("summaryReviewDecisionDenied") };
  }

  const supabase = await createServerActionSupabaseClient();
  const result = await supabase.rpc("upsert_document_summary_review", {
    target_document_id: documentId,
    requested_language: parsedLanguage.data,
    // The RPC uses 0 only as a transport sentinel for an omitted rating; it
    // normalizes it to NULL before enforcing the persisted 1–5 constraint.
    requested_overall_rating: input.data.overallRating ?? 0,
    requested_accuracy_rating: input.data.accuracyRating ?? 0,
    requested_completeness_rating: input.data.completenessRating ?? 0,
    requested_citation_rating: input.data.citationRating ?? 0,
    requested_language_rating: input.data.languageRating ?? 0,
    requested_issue_categories: input.data.issueCategories,
    requested_feedback: input.data.feedback ?? "",
    requested_decision: input.data.decision ?? "",
  });
  if (result.error || result.data !== true)
    return { status: "error", message: t("summaryReviewUnavailable") };
  revalidateSummaryQualityPaths(locale, documentId);
  return {
    status: "success",
    message: input.data.decision === null ? t("summaryReviewSaved") : t("summaryReviewDecisionSaved"),
  };
}
