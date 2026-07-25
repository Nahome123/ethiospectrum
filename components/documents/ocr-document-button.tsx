"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { queueDocumentOcrAction } from "@/lib/documents/ocr-actions";
import { initialDocumentOcrActionState } from "@/lib/documents/ocr-action-state";

export function OcrDocumentButton({
  documentId,
  locale,
  retry,
}: {
  documentId: string;
  locale: AppLocale;
  retry: boolean;
}) {
  const t = useTranslations("documents");
  const [state, action, pending] = useActionState(
    queueDocumentOcrAction.bind(null, locale, documentId),
    initialDocumentOcrActionState,
  );

  return (
    <form action={action}>
      <Button disabled={pending} type="submit" variant={retry ? "outline" : "default"}>
        {pending ? t("ocrSubmitting") : retry ? t("retryOcr") : t("runOcr")}
      </Button>
      {state.status !== "idle" ? (
        <p
          className={
            state.status === "error" ? "mt-2 text-sm text-destructive" : "mt-2 text-sm text-muted-foreground"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
