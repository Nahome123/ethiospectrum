import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { DocumentQuestionStatusBadge } from "@/components/documents/document-question-status-badge";
import type { AppLocale } from "@/i18n/routing";
import type { DocumentQuestionLanguage, DocumentQuestionStatus } from "@/lib/documents/questions/constants";

export type DocumentQuestionPanelDetails = {
  question: string;
  language: DocumentQuestionLanguage;
  status: DocumentQuestionStatus;
  retryable: boolean;
  completedAt: string | null;
  sourceCoverage: "full" | "partial";
  answer: string | null;
  sourceReferences: readonly {
    page_number: number;
    chunk_index: number | null;
    excerpt: string;
  }[];
};

export type DocumentQuestionAvailability =
  "eligible" | "processing_required" | "ocr_required" | "unavailable";

function languageLabel(
  language: DocumentQuestionLanguage,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (language === "am") return t("languageAmharic");
  if (language === "es") return t("languageSpanish");
  return t("languageEnglish");
}

function formatTimestamp(value: string | null, locale: AppLocale): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function availabilityMessage(
  availability: DocumentQuestionAvailability,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string | null {
  if (availability === "processing_required") return t("processingRequired");
  if (availability === "ocr_required") return t("ocrRequired");
  if (availability === "unavailable") return t("questionUnavailable");
  return null;
}

/** Renders protected question answers and excerpts on the server only. */
export async function DocumentQuestionPanel({
  locale,
  availability,
  canRequest,
  details,
  requestControl,
  sourceLocation,
}: {
  locale: AppLocale;
  availability: DocumentQuestionAvailability;
  canRequest: boolean;
  details: readonly DocumentQuestionPanelDetails[];
  requestControl?: ReactNode;
  sourceLocation: "page" | "section";
}) {
  const t = await getTranslations("documents");
  const eligibilityMessage = availabilityMessage(availability, t);

  return (
    <section className="mt-8 rounded-2xl border bg-card p-6" aria-labelledby="document-questions-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" id="document-questions-title">
            {t("documentQuestions")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("documentQuestionsDescription")}</p>
        </div>
      </div>
      {eligibilityMessage ? <p className="mt-3 text-sm text-muted-foreground">{eligibilityMessage}</p> : null}
      {availability === "eligible" && canRequest && requestControl ? requestControl : null}
      {availability === "eligible" && !canRequest ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("questionReadOnly")}</p>
      ) : null}

      {details.length ? (
        <ol className="mt-6 space-y-4" aria-label={t("recentQuestions")}>
          {details.map((detail, questionIndex) => {
            const completedAt = formatTimestamp(detail.completedAt, locale);
            return (
              <li
                className="rounded-xl border bg-background p-4"
                key={`${detail.question}-${detail.language}-${detail.completedAt ?? questionIndex}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">{detail.question}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("answerLanguage")}: {languageLabel(detail.language, t)}
                      {completedAt ? ` · ${t("generated")}: ${completedAt}` : ""}
                    </p>
                  </div>
                  <DocumentQuestionStatusBadge status={detail.status} />
                </div>
                {detail.status === "queued" || detail.status === "answering" ? (
                  <p className="mt-3 text-sm text-muted-foreground" role="status">
                    {detail.status === "queued" ? t("questionQueued") : t("answeringQuestion")}
                  </p>
                ) : null}
                {detail.status === "failed" ? (
                  <p className="mt-3 text-sm text-destructive" role="status">
                    {detail.retryable ? t("answerRetryAvailable") : t("answerFailed")}
                  </p>
                ) : null}
                {detail.status === "completed" && detail.answer ? (
                  <div className="mt-4">
                    {detail.sourceCoverage === "partial" ? (
                      <p className="mb-3 text-sm text-muted-foreground">{t("partialDocumentAnswer")}</p>
                    ) : null}
                    <aside className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                      {t("answerMayContainErrors")} {t("verifyWithOriginalDocument")}
                    </aside>
                    {detail.language === "am" || detail.language === "es" ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {t("questionTranslationVerification")}
                      </p>
                    ) : null}
                    <p className="mt-4 break-words whitespace-pre-wrap">{detail.answer}</p>
                    <section
                      className="mt-4"
                      aria-labelledby={`document-question-sources-${questionIndex + 1}`}
                    >
                      <h4 className="font-semibold" id={`document-question-sources-${questionIndex + 1}`}>
                        {t("sources")}
                      </h4>
                      <ol className="mt-2 space-y-2">
                        {detail.sourceReferences.map((reference, index) => (
                          <li key={`${questionIndex + 1}-${index + 1}`}>
                            <details className="rounded-lg border px-3 py-2">
                              <summary className="cursor-pointer break-words font-semibold">
                                {t("source")} {index + 1}: {t(sourceLocation)} {reference.page_number}
                                {reference.chunk_index === null
                                  ? null
                                  : ` · ${t("chunk")} ${reference.chunk_index + 1}`}
                              </summary>
                              <p className="mt-2 break-words whitespace-pre-wrap text-sm text-muted-foreground">
                                {reference.excerpt}
                              </p>
                            </details>
                          </li>
                        ))}
                      </ol>
                    </section>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
