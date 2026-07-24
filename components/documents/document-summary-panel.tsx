import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { DocumentSummaryStatusBadge } from "@/components/documents/document-summary-status-badge";
import type { AppLocale } from "@/i18n/routing";
import type { DocumentSummaryLanguage, DocumentSummaryStatus } from "@/lib/documents/summaries/constants";

type DocumentSummarySection =
  | "overview"
  | "keyPoints"
  | "importantDates"
  | "actionItems"
  | "organizationsOrPeople"
  | "warningsOrUncertainties";

type DocumentSummaryStatement = {
  text: string;
};

type DocumentSummaryImportantDate = {
  date: string;
  description: string;
};

type DocumentSummaryOrganizationOrPerson = {
  name: string;
  description: string;
};

/**
 * Presentation-safe summary content for a Server Component. It intentionally
 * excludes raw pages, chunks, database IDs, provider metadata, and error data.
 */
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
  sourceReferences: readonly {
    section: DocumentSummarySection;
    item_index: number;
    page_number: number;
    chunk_index: number | null;
    excerpt: string;
  }[];
};

export type DocumentSummaryAvailability = "eligible" | "processing_required" | "ocr_required" | "unavailable";

type SourceReferenceWithIndex = {
  section: DocumentSummarySection;
  itemIndex: number;
  pageNumber: number;
  chunkIndex: number | null;
  excerpt: string;
  index: number;
};

function languageLabel(
  language: DocumentSummaryLanguage,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (language === "am") return t("languageAmharic");
  if (language === "es") return t("languageSpanish");
  return t("languageEnglish");
}

function SummaryLanguageViewer({
  language,
  t,
}: {
  language: DocumentSummaryLanguage;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
      <div className="grid gap-1">
        <label className="text-sm font-semibold" htmlFor="document-summary-view-language">
          {t("viewSummaryLanguage")}
        </label>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          defaultValue={language}
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
  );
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
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
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

function StatementSourceLinks({
  references,
  t,
}: {
  references: readonly SourceReferenceWithIndex[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (!references.length) return null;

  return (
    <span className="ml-2 inline-flex flex-wrap gap-x-2 gap-y-1 text-xs">
      {references.map((reference) => (
        <a
          className="font-semibold text-primary underline underline-offset-2"
          href={`#document-summary-source-${reference.index}`}
          key={reference.index}
        >
          {t("source")} {reference.index + 1}
        </a>
      ))}
    </span>
  );
}

function SummaryStatements({
  section,
  statements,
  references,
  t,
}: {
  section: Exclude<DocumentSummarySection, "overview" | "importantDates" | "organizationsOrPeople">;
  statements: readonly DocumentSummaryStatement[];
  references: readonly SourceReferenceWithIndex[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (!statements.length) return null;

  return (
    <section className="mt-6" aria-labelledby={`document-summary-${section}`}>
      <h3 className="text-base font-bold" id={`document-summary-${section}`}>
        {sectionLabel(section, t)}
      </h3>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        {statements.map((statement, itemIndex) => (
          <li className="break-words" key={`${section}-${itemIndex}`}>
            <span className="whitespace-pre-wrap">{statement.text}</span>
            <StatementSourceLinks
              references={references.filter(
                (reference) => reference.section === section && reference.itemIndex === itemIndex,
              )}
              t={t}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ImportantDates({
  dates,
  references,
  t,
}: {
  dates: readonly DocumentSummaryImportantDate[];
  references: readonly SourceReferenceWithIndex[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (!dates.length) return null;

  return (
    <section className="mt-6" aria-labelledby="document-summary-important-dates">
      <h3 className="text-base font-bold" id="document-summary-important-dates">
        {t("importantDates")}
      </h3>
      <dl className="mt-2 space-y-3">
        {dates.map((date, itemIndex) => (
          <div key={`important-date-${itemIndex}`}>
            <dt className="font-semibold">{date.date}</dt>
            <dd className="mt-1 break-words whitespace-pre-wrap">
              {date.description}
              <StatementSourceLinks
                references={references.filter(
                  (reference) => reference.section === "importantDates" && reference.itemIndex === itemIndex,
                )}
                t={t}
              />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OrganizationsAndPeople({
  organizationsOrPeople,
  references,
  t,
}: {
  organizationsOrPeople: readonly DocumentSummaryOrganizationOrPerson[];
  references: readonly SourceReferenceWithIndex[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (!organizationsOrPeople.length) return null;

  return (
    <section className="mt-6" aria-labelledby="document-summary-organizations-and-people">
      <h3 className="text-base font-bold" id="document-summary-organizations-and-people">
        {t("organizationsAndPeople")}
      </h3>
      <dl className="mt-2 space-y-3">
        {organizationsOrPeople.map((organization, itemIndex) => (
          <div key={`organization-or-person-${itemIndex}`}>
            <dt className="font-semibold">{organization.name}</dt>
            <dd className="mt-1 break-words whitespace-pre-wrap">
              {organization.description}
              <StatementSourceLinks
                references={references.filter(
                  (reference) =>
                    reference.section === "organizationsOrPeople" && reference.itemIndex === itemIndex,
                )}
                t={t}
              />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SourceReferences({
  references,
  sourceLocation,
  t,
}: {
  references: readonly SourceReferenceWithIndex[];
  sourceLocation: "page" | "section";
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (!references.length) return null;

  return (
    <section className="mt-6" aria-labelledby="document-summary-sources">
      <h3 className="text-base font-bold" id="document-summary-sources">
        {t("sources")}
      </h3>
      <ol className="mt-2 space-y-2">
        {references.map((reference) => (
          <li id={`document-summary-source-${reference.index}`} key={reference.index}>
            <details className="rounded-lg border bg-background px-3 py-2">
              <summary className="cursor-pointer break-words font-semibold">
                {t("source")} {reference.index + 1}: {t(sourceLocation)} {reference.pageNumber} ·{" "}
                {t("section")}: {sectionLabel(reference.section, t)}
                {reference.chunkIndex === null ? null : ` · ${t("chunk")} ${reference.chunkIndex + 1}`}
              </summary>
              <p className="mt-2 break-words whitespace-pre-wrap text-sm text-muted-foreground">
                {reference.excerpt}
              </p>
            </details>
          </li>
        ))}
      </ol>
    </section>
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

/**
 * Renders protected summary text only on the server. The optional request
 * control is intentionally supplied separately so no summary data crosses the
 * Client Component boundary used to start a new request.
 */
export async function DocumentSummaryPanel({
  locale,
  availability,
  canRequest,
  details,
  requestControl,
  summaryLanguage,
  sourceLocation,
}: {
  locale: AppLocale;
  availability: DocumentSummaryAvailability;
  canRequest: boolean;
  details: DocumentSummaryPanelDetails | null;
  requestControl?: ReactNode;
  summaryLanguage: DocumentSummaryLanguage;
  sourceLocation: "page" | "section";
}) {
  const t = await getTranslations("documents");
  const references = (details?.sourceReferences ?? []).map((reference, index) => ({
    section: reference.section,
    itemIndex: reference.item_index,
    pageNumber: reference.page_number,
    chunkIndex: reference.chunk_index,
    excerpt: reference.excerpt,
    index,
  }));
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
        <SummaryLanguageViewer language={summaryLanguage} t={t} />
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
                    <StatementSourceLinks
                      references={references.filter(
                        (reference) => reference.section === "overview" && reference.itemIndex === 0,
                      )}
                      t={t}
                    />
                  </p>
                </section>
              ) : null}
              <SummaryStatements
                references={references}
                section="keyPoints"
                statements={structuredSummary?.keyPoints ?? []}
                t={t}
              />
              <ImportantDates dates={structuredSummary?.importantDates ?? []} references={references} t={t} />
              <SummaryStatements
                references={references}
                section="actionItems"
                statements={structuredSummary?.actionItems ?? []}
                t={t}
              />
              <OrganizationsAndPeople
                organizationsOrPeople={structuredSummary?.organizationsOrPeople ?? []}
                references={references}
                t={t}
              />
              <SummaryStatements
                references={references}
                section="warningsOrUncertainties"
                statements={structuredSummary?.warningsOrUncertainties ?? []}
                t={t}
              />
            </>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">{t("summaryNoContent")}</p>
          )}

          <SourceReferences references={references} sourceLocation={sourceLocation} t={t} />
        </div>
      ) : null}
    </section>
  );
}
