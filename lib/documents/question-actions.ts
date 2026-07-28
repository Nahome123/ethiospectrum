"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { documentIdSchema } from "@/lib/validation/document";
import { getDocumentContext } from "./server";
import type { DocumentQuestionActionState } from "./question-action-state";
import { documentQuestionInputSchema, documentQuestionLanguageSchema } from "./questions/schemas";

function revalidateDocumentQuestionPaths(documentId: string): void {
  for (const locale of ["en", "am", "es"]) {
    revalidatePath(`/${locale}/documents`);
    revalidatePath(`/${locale}/documents/${documentId}`);
    revalidatePath(`/${locale}/dashboard`);
  }
}

/** Requests only bounded user input; PostgreSQL derives all security-sensitive fields. */
export async function requestDocumentQuestionAction(
  locale: AppLocale,
  documentId: string,
  _previousState: DocumentQuestionActionState,
  formData: FormData,
): Promise<DocumentQuestionActionState> {
  const t = await getTranslations({ locale, namespace: "documents" });
  const language = documentQuestionLanguageSchema.safeParse(formData.get("language"));
  const question = documentQuestionInputSchema.safeParse({ question: formData.get("question") });
  if (!documentIdSchema.safeParse(documentId).success || !language.success || !question.success) {
    return { status: "error", message: t("questionUnavailable") };
  }

  const context = await getDocumentContext();
  if (!context?.canProcess) return { status: "error", message: t("questionAccessDenied") };

  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.rpc("request_document_question", {
    target_document_id: documentId,
    requested_language: language.data,
    requested_question: question.data.question,
  });
  if (error || !data?.[0]) return { status: "error", message: t("questionUnavailable") };

  revalidateDocumentQuestionPaths(documentId);
  if (data[0].reused_completed) return { status: "success", message: t("answerAvailable") };
  if (data[0].already_active) return { status: "success", message: t("questionAlreadyQueued") };
  return { status: "success", message: t("questionQueued") };
}
