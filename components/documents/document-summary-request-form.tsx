"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { requestDocumentSummaryAction } from "@/lib/documents/summary-actions";
import { initialDocumentSummaryActionState } from "@/lib/documents/summary-action-state";

/**
 * This client boundary only submits a document ID and the requested language.
 * Summary text and citations remain in the parent Server Component.
 */
export function DocumentSummaryRequestForm({
  documentId,
  existing,
  locale,
  retry,
}: {
  documentId: string;
  existing: boolean;
  locale: AppLocale;
  retry: boolean;
}) {
  const t = useTranslations("documents");
  const [state, action, pending] = useActionState(
    requestDocumentSummaryAction.bind(null, locale, documentId),
    initialDocumentSummaryActionState,
  );

  return (
    <form action={action} aria-busy={pending} className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1">
        <label className="text-sm font-semibold" htmlFor="document-summary-language">
          {t("summaryLanguage")}
        </label>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          defaultValue={locale}
          disabled={pending}
          id="document-summary-language"
          name="language"
        >
          <option value="en">{t("languageEnglish")}</option>
          <option value="am">{t("languageAmharic")}</option>
          <option value="es">{t("languageSpanish")}</option>
        </select>
      </div>
      <Button disabled={pending} type="submit" variant={retry ? "outline" : "default"}>
        {pending
          ? t("generatingSummary")
          : retry
            ? t("retrySummary")
            : existing
              ? t("generateAgain")
              : t("generateSummary")}
      </Button>
      {state.status !== "idle" ? (
        <p
          className={
            state.status === "error"
              ? "basis-full text-sm text-destructive"
              : "basis-full text-sm text-muted-foreground"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
