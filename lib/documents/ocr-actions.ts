"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { documentIdSchema } from "@/lib/validation/document";
import type { DocumentOcrActionState } from "./ocr-action-state";
import { getDocumentContext } from "./server";

function revalidateOcrPaths(locale: AppLocale, documentId: string): void {
  revalidatePath(`/${locale}/documents`);
  revalidatePath(`/${locale}/documents/${documentId}`);
  revalidatePath(`/${locale}/dashboard`);
}

export async function queueDocumentOcrAction(
  locale: AppLocale,
  documentId: string,
  _state: DocumentOcrActionState,
): Promise<DocumentOcrActionState> {
  void _state;
  const t = await getTranslations({ locale, namespace: "documents" });
  if (!documentIdSchema.safeParse(documentId).success) return { status: "error", message: t("ocrFailed") };

  const context = await getDocumentContext();
  if (!context?.canProcess) return { status: "error", message: t("processingAccessDenied") };

  const supabase = await createServerActionSupabaseClient();
  const queued = await supabase.rpc("queue_document_ocr", { target_document_id: documentId });
  const job = queued.data?.[0];
  if (queued.error || !job) return { status: "error", message: t("ocrFailed") };

  revalidateOcrPaths(locale, documentId);
  return {
    status: "success",
    message: job.already_queued ? t("ocrAlreadyQueued") : t("ocrQueued"),
  };
}
