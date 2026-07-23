"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { documentIdSchema } from "@/lib/validation/document";
import type { DocumentProcessingActionState } from "./processing-action-state";
import { getDocumentContext } from "./server";

function revalidateProcessingPaths(locale: AppLocale, documentId: string): void {
  revalidatePath(`/${locale}/documents`);
  revalidatePath(`/${locale}/documents/${documentId}`);
  revalidatePath(`/${locale}/dashboard`);
}

export async function queueDocumentProcessingAction(
  locale: AppLocale,
  documentId: string,
  _state: DocumentProcessingActionState,
): Promise<DocumentProcessingActionState> {
  void _state;
  const t = await getTranslations({ locale, namespace: "documents" });
  if (!documentIdSchema.safeParse(documentId).success) {
    return { status: "error", message: t("processingFailed") };
  }

  const context = await getDocumentContext();
  if (!context?.canProcess) {
    return { status: "error", message: t("processingAccessDenied") };
  }

  const supabase = await createServerActionSupabaseClient();
  const queued = await supabase.rpc("queue_document_processing", { target_document_id: documentId });
  const job = queued.data?.[0];
  if (queued.error || !job) {
    return { status: "error", message: t("processingFailed") };
  }

  revalidateProcessingPaths(locale, documentId);
  return {
    status: "success",
    message: job.already_queued ? t("processingAlreadyQueued") : t("processingStarted"),
  };
}
