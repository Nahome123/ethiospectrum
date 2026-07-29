import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { CitationList } from "@/components/documents/citation-list";
import { DocumentSummaryStatusBadge } from "@/components/documents/document-summary-status-badge";
import type { AppLocale } from "@/i18n/routing";
import type { DocumentCitation } from "@/lib/documents/citations/types";
import type { DocumentSummaryLanguage, DocumentSummaryStatus } from "@/lib/documents/summaries/constants";

type DocumentSummarySection =
  | "overview"
  | "keyPoints"
  | "importantDates"
  | "actionItems"
  | "organizationsOrPeople"
  | "warningsOrUncertainties";

type DocumentSummaryStatement = { text: string };
type DocumentSummaryImportantDate = { date: string; description: string };
type DocumentSummaryOrganizationOrPerson = { name: string; description: string };

/** Presentation-safe content: no excerpts, chunks, paths, or provider data cross this boundary. */
export type DocumentSummaryPanelDetails = {
  status: DocumentSummaryStatus;
  language: DocumentSummaryLanguage;
  retryable: boolean;
  completedAt: string | null;
  sourceCoverage: "full" | "partial";
  structuredSummary: {
    overview: DocumentSummaryStatement;
    keyPoints: readonly DocumentSummaryStatement[];
    importantDates: readonly DocumentSummaryImportantDate[];
    actionItems: readonly DocumentSummaryStatement[];
    organizationsOrPeople: readonly DocumentSummaryOrganizationOrPerson[];
    warningsOrUncertainties: readonly DocumentSummaryStatement[];
  } | null;
  sourceReferences: readonly (DocumentCitation & {
    section: DocumentSummarySection | null;
    itemIndex: number | null;
  })[];
};

export type DocumentSummaryAvailability = "eligible" | "processing_required" | "ocr_required" | "unavailable";

function languageLabel(
  language: DocumentSummaryLanguage,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (language === "am") return t("languageAmharic");
  if (language === "es") return t("languageSpanish");
  return t("languageEnglish");
}

function sectionLabel(
  section: DocumentSummarySection,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (section === "keyPoints") return t("keyPoints");
  if (section === "importantDates") return t("importantDates");
  if (section === "actionItems") return t("actionItems");
  if (section === "organizationsOrPeople") return t("organizationsAndPeople");
  if (section === "warningsOrUncertainties") return t("warningsAndUncertainties");
  return t("overview");
}

function formatTimestamp(value: string | null, locale: AppLocale): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? null
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function hasStructuredSummaryContent(summary: DocumentSummaryPanelDetails["structuredSummary"]): boolean {
  return Boolean(
    summary &&
    (summary.overview.text ||
      summary.keyPoints.length ||
      summary.importantDates.length ||
      summary.actionItems.length ||
      summary.organizationsOrPeople.length ||
      summary.warningsOrUncertainties.length),
  );
}

function StatementCitations({
  citations,
  locale,
}: {
  citations: readonly DocumentCitation[];
  locale: AppLocale;
}) {
  return (
    <CitationList
      citations={citations}
      className="ml-2 inline-flex flex-wrap gap-2 align-middle"
      locale={locale}
    />
  );
}

function availabilityMessage(
  availability: DocumentSummaryAvailability,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string | null {
  if (availability === "processing_required") return t("processingRequired");
  if (availability === "ocr_required") return t("ocrRequired");
  if (availability === "unavailable") return t("summaryUnavailable");
  return null;
}

/** Renders structured summary text and owner-bound interactive citations on the server. */
export async function DocumentSummaryPanel({
  locale,
  availability,
  canRequest,
  details,
  requestControl,
  summaryLanguage,
}: {
  locale: AppLocale;
  availability: DocumentSummaryAvailability;
  canRequest: boolean;
  details: DocumentSummaryPanelDetails | null;
  requestControl?: ReactNode;
  summaryLanguage: DocumentSummaryLanguage;
}) {
  const t = await getTranslations("documents");
  const references = details?.sourceReferences ?? [];
  const citationsFor = (section: DocumentSummarySection, itemIndex: number) =>
    references.filter((reference) => reference.section === section && reference.itemIndex === itemIndex);
  const unplacedCitations = references.filter(
    (reference) => reference.section === null || reference.itemIndex === null,
  );
  const eligibilityMessage = availabilityMessage(availability, t);
  const canShowRequestControl = availability === "eligible" && canRequest;
  const generatedAt = details ? formatTimestamp(details.completedAt, locale) : null;
  const structuredSummary = details?.structuredSummary ?? null;

  return (
    <section className="mt-8 rounded-2xl border bg-card p-6" aria-labelledby="document-summary-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-bold" id="document-summary-title">
          {t("documentSummary")}
        </h2>
        <DocumentSummaryStatusBadge status={details?.status ?? null} />
      </div>
      {eligibilityMessage ? <p className="mt-3 text-sm text-muted-foreground">{eligibilityMessage}</p> : null}
      {availability === "eligible" || details ? (
        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <div className="grid gap-1">
            <label className="text-sm font-semibold" htmlFor="document-summary-view-language">
              {t("viewSummaryLanguage")}
            </label>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              defaultValue={summaryLanguage}
              id="document-summary-view-language"
              name="summaryLanguage"
            >
              <option value="en">{t("languageEnglish")}</option>
              <option value="am">{t("languageAmharic")}</option>
              <option value="es">{t("languageSpanish")}</option>
            </select>
          </div>
          <button
            className="inline-flex h-9 items-center justify-center rounded-4xl border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
            type="submit"
          >
            {t("viewSummary")}
          </button>
        </form>
      ) : null}
      {details?.status === "queued" || details?.status === "generating" ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {details.status === "queued" ? t("summaryQueued") : t("generatingSummary")}
        </p>
      ) : null}
      {details?.status === "failed" ? (
        <p className="mt-3 text-sm text-destructive" role="status">
          {t("summaryFailed")}
        </p>
      ) : null}
      {canShowRequestControl && requestControl ? <div className="mt-4">{requestControl}</div> : null}
      {availability === "eligible" && !details && !canRequest ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("summaryReadOnly")}</p>
      ) : null}

      {details?.status === "completed" ? (
        <div className="mt-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold">{t("summaryLanguage")}</dt>
              <dd className="mt-1">{languageLabel(details.language, t)}</dd>
            </div>
            {generatedAt ? (
              <div>
                <dt className="font-semibold">{t("generated")}</dt>
                <dd className="mt-1">{generatedAt}</dd>
              </div>
            ) : null}
          </dl>
          {details.sourceCoverage === "partial" ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("partialDocumentSummary")}</p>
          ) : null}
          <aside className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            {t("summaryMayContainErrors")} {t("verifyWithOriginalDocument")}
          </aside>
          {details.language === "am" || details.language === "es" ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("summaryTranslationVerification")}</p>
          ) : null}

          {hasStructuredSummaryContent(structuredSummary) ? (
            <>
              {structuredSummary?.overview.text ? (
                <section className="mt-6" aria-labelledby="document-summary-overview">
                  <h3 className="text-base font-bold" id="document-summary-overview">
                    {t("overview")}
                  </h3>
                  <p className="mt-2 break-words whitespace-pre-wrap">
                    {structuredSummary.overview.text}
                    <StatementCitations citations={citationsFor("overview", 0)} locale={locale} />
                  </p>
                </section>
              ) : null}
              {(["keyPoints", "actionItems", "warningsOrUncertainties"] as const).map((section) => {
                const statements = structuredSummary?.[section] ?? [];
                return statements.length ? (
                  <section className="mt-6" aria-labelledby={`document-summary-${section}`} key={section}>
                    <h3 className="text-base font-bold" id={`document-summary-${section}`}>
                      {sectionLabel(section, t)}
                    </h3>
                    <ul className="mt-2 list-disc space-y-2 pl-5">
                      {statements.map((statement, itemIndex) => (
                        <li className="break-words" key={`${section}-${itemIndex}`}>
                          <span className="whitespace-pre-wrap">{statement.text}</span>
                          <StatementCitations citations={citationsFor(section, itemIndex)} locale={locale} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null;
              })}
              {structuredSummary?.importantDates.length ? (
                <section className="mt-6" aria-labelledby="document-summary-important-dates">
                  <h3 className="text-base font-bold" id="document-summary-important-dates">
                    {t("importantDates")}
                  </h3>
                  <dl className="mt-2 space-y-3">
                    {structuredSummary.importantDates.map((date, itemIndex) => (
                      <div key={`important-date-${itemIndex}`}>
                        <dt className="font-semibold">{date.date}</dt>
                        <dd className="mt-1 break-words whitespace-pre-wrap">
                          {date.description}
                          <StatementCitations
                            citations={citationsFor("importantDates", itemIndex)}
                            locale={locale}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
              {structuredSummary?.organizationsOrPeople.length ? (
                <section className="mt-6" aria-labelledby="document-summary-organizations-and-people">
                  <h3 className="text-base font-bold" id="document-summary-organizations-and-people">
                    {t("organizationsAndPeople")}
                  </h3>
                  <dl className="mt-2 space-y-3">
                    {structuredSummary.organizationsOrPeople.map((item, itemIndex) => (
                      <div key={`organization-or-person-${itemIndex}`}>
                        <dt className="font-semibold">{item.name}</dt>
                        <dd className="mt-1 break-words whitespace-pre-wrap">
                          {item.description}
                          <StatementCitations
                            citations={citationsFor("organizationsOrPeople", itemIndex)}
                            locale={locale}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
            </>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">{t("summaryNoContent")}</p>
          )}

          {unplacedCitations.length ? (
            <section className="mt-6" aria-labelledby="document-summary-unavailable-sources">
              <h3 className="text-base font-bold" id="document-summary-unavailable-sources">
                {t("citations")}
              </h3>
              <CitationList citations={unplacedCitations} locale={locale} />
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
