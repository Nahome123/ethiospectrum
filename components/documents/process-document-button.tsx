"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { queueDocumentProcessingAction } from "@/lib/documents/processing-actions";
import { initialDocumentProcessingActionState } from "@/lib/documents/processing-action-state";

export function ProcessDocumentButton({
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
    queueDocumentProcessingAction.bind(null, locale, documentId),
    initialDocumentProcessingActionState,
  );

  return (
    <form action={action}>
      <Button disabled={pending} type="submit" variant={retry ? "outline" : "default"}>
        {pending ? t("processing") : retry ? t("retryProcessing") : t("processDocument")}
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
