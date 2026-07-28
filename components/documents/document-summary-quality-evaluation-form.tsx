"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { evaluateDocumentSummaryAction } from "@/lib/documents/summary-quality-actions";
import { initialDocumentSummaryQualityActionState } from "@/lib/documents/summary-quality-action-state";

/** Client boundary submits no household, reviewer, score, source, or summary data. */
export function DocumentSummaryQualityEvaluationForm({
  documentId,
  language,
  locale,
}: {
  documentId: string;
  language: string;
  locale: AppLocale;
}) {
  const t = useTranslations("documents");
  const [state, action, pending] = useActionState(
    evaluateDocumentSummaryAction.bind(null, locale, documentId, language),
    initialDocumentSummaryQualityActionState,
  );

  return (
    <form action={action} aria-busy={pending} className="mt-4 flex flex-wrap items-center gap-3">
      <Button disabled={pending} type="submit">
        {pending ? t("evaluatingSummaryQuality") : t("evaluateSummaryQuality")}
      </Button>
      {state.status !== "idle" ? (
        <p
          className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
