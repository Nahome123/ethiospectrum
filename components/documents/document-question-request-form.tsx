"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { requestDocumentQuestionAction } from "@/lib/documents/question-actions";
import { initialDocumentQuestionActionState } from "@/lib/documents/question-action-state";

/** Client code submits only a bounded question and language; answers remain server-rendered. */
export function DocumentQuestionRequestForm({
  documentId,
  locale,
}: {
  documentId: string;
  locale: AppLocale;
}) {
  const t = useTranslations("documents");
  const [state, action, pending] = useActionState(
    requestDocumentQuestionAction.bind(null, locale, documentId),
    initialDocumentQuestionActionState,
  );

  return (
    <form action={action} aria-busy={pending} className="mt-4 grid gap-3">
      <div className="grid gap-1">
        <label className="text-sm font-semibold" htmlFor="document-question">
          {t("askAboutDocument")}
        </label>
        <textarea
          className="min-h-24 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm"
          disabled={pending}
          id="document-question"
          maxLength={700}
          name="question"
          required
        />
        <p className="text-sm text-muted-foreground">{t("questionLimit")}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label className="text-sm font-semibold" htmlFor="document-question-language">
            {t("answerLanguage")}
          </label>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            defaultValue={locale}
            disabled={pending}
            id="document-question-language"
            name="language"
          >
            <option value="en">{t("languageEnglish")}</option>
            <option value="am">{t("languageAmharic")}</option>
            <option value="es">{t("languageSpanish")}</option>
          </select>
        </div>
        <Button disabled={pending} type="submit">
          {pending ? t("answeringQuestion") : t("askQuestion")}
        </Button>
      </div>
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
