import { getTranslations } from "next-intl/server";
import { DocumentSummaryQualityEvaluationForm } from "@/components/documents/document-summary-quality-evaluation-form";
import { DocumentSummaryReviewForm } from "@/components/documents/document-summary-review-form";
import type { AppLocale } from "@/i18n/routing";
import type { DocumentSummaryQualityDetails } from "@/lib/documents/server";
import type { DocumentSummaryLanguage } from "@/lib/documents/summaries/constants";
import type {
  DocumentSummaryQualityWarning,
  DocumentSummaryReviewIssueCategory,
} from "@/lib/documents/summary-quality-schemas";

function formatTimestamp(value: string | null, locale: AppLocale): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function reviewStatusLabel(
  status: DocumentSummaryQualityDetails["reviewStatus"],
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (status === "approved") return t("summaryReviewApproved");
  if (status === "rejected") return t("summaryReviewRejected");
  if (status === "needs_revision") return t("summaryReviewNeedsRevision");
  if (status === "review_in_progress") return t("summaryReviewInProgress");
  return t("summaryReviewUnreviewed");
}

function warningLabel(
  warning: DocumentSummaryQualityWarning,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  const key = `summaryQualityWarning${warning
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("")}` as const;
  return t(key);
}

function issueCategoryLabel(
  category: DocumentSummaryReviewIssueCategory,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  const key = `summaryReviewIssue${category
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("")}` as const;
  return t(key);
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <dt className="text-sm font-semibold">{label}</dt>
      <dd className="mt-1 text-lg font-bold">{value === null ? "—" : `${value}%`}</dd>
    </div>
  );
}

/**
 * Server-rendered quality/review data stays outside the small client forms.
 * The forms receive only their own safe field values and never summary content,
 * source excerpts, household IDs, or reviewer identities.
 */
export async function DocumentSummaryQualityPanel({
  canDecide,
  canEvaluate,
  canReview,
  details,
  documentId,
  language,
  locale,
}: {
  canDecide: boolean;
  canEvaluate: boolean;
  canReview: boolean;
  details: DocumentSummaryQualityDetails;
  documentId: string;
  language: DocumentSummaryLanguage;
  locale: AppLocale;
}) {
  const t = await getTranslations("documents");
  const evaluation = details.evaluation;
  const pendingReview = details.reviews.find(
    (review) => review.isOwnReview && review.reviewStatus === "review_in_progress",
  );

  return (
    <section className="mt-6 rounded-2xl border bg-card p-6" aria-labelledby="document-summary-quality-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" id="document-summary-quality-title">
            {t("summaryQualityAndReview")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("summaryQualityExplanation")}</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-sm font-semibold" role="status">
          {evaluation?.status === "completed"
            ? t("summaryQualityCompleted")
            : t("summaryQualityNotEvaluated")}
        </span>
      </div>

      {evaluation?.status === "completed" ? (
        <div className="mt-5">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Score label={t("summaryQualityOverallScore")} value={evaluation.overallScore} />
            <Score label={t("summaryQualityGroundingScore")} value={evaluation.groundingScore} />
            <Score label={t("summaryQualityCitationScore")} value={evaluation.citationCoverageScore} />
            <Score label={t("summaryQualityCompletenessScore")} value={evaluation.completenessScore} />
            <Score label={t("summaryQualityLanguageScore")} value={evaluation.languageScore} />
            <Score label={t("summaryQualitySafetyScore")} value={evaluation.safetyScore} />
          </dl>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold">{t("summaryQualityCitationCoverage")}</dt>
              <dd className="mt-1">
                {evaluation.citedStatements}/{evaluation.citationStatements}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">{t("summaryQualityDocumentCoverage")}</dt>
              <dd className="mt-1">
                {evaluation.fullDocumentAnalysed
                  ? t("summaryQualityFullDocument")
                  : t("summaryQualityPartialDocument")}
              </dd>
            </div>
            {formatTimestamp(evaluation.evaluatedAt, locale) ? (
              <div>
                <dt className="font-semibold">{t("summaryQualityEvaluatedAt")}</dt>
                <dd className="mt-1">{formatTimestamp(evaluation.evaluatedAt, locale)}</dd>
              </div>
            ) : null}
          </dl>
          {evaluation.warnings.length ? (
            <aside
              className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
              aria-labelledby="summary-quality-warnings-title"
            >
              <h3 className="font-semibold" id="summary-quality-warnings-title">
                {t("summaryQualityWarnings")}
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {evaluation.warnings.map((warning) => (
                  <li key={warning}>{warningLabel(warning as DocumentSummaryQualityWarning, t)}</li>
                ))}
              </ul>
            </aside>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">{t("summaryQualityNoWarnings")}</p>
          )}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">{t("summaryQualityPendingExplanation")}</p>
      )}

      {canEvaluate ? (
        <DocumentSummaryQualityEvaluationForm documentId={documentId} language={language} locale={locale} />
      ) : null}

      <div className="mt-8 border-t pt-6">
        <h3 className="text-lg font-bold">{t("summaryReview")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("summaryReviewExplanation")}</p>
        <p className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm">{t("summaryReviewDisclaimer")}</p>
        <p className="mt-4 text-sm font-semibold" role="status">
          {t("summaryReviewStatus")}: {reviewStatusLabel(details.reviewStatus, t)}
        </p>

        {details.reviews.length ? (
          <ol className="mt-4 space-y-3" aria-label={t("summaryReviewHistory")}>
            {details.reviews.map((review, index) => (
              <li className="rounded-lg border bg-background p-4" key={`${review.updatedAt}-${index}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{review.isOwnReview ? t("you") : t("householdMember")}</p>
                  <p className="text-sm text-muted-foreground">{reviewStatusLabel(review.reviewStatus, t)}</p>
                </div>
                {review.feedback ? (
                  <p className="mt-2 break-words whitespace-pre-wrap text-sm">{review.feedback}</p>
                ) : null}
                {review.issueCategories.length ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {review.issueCategories.map((category) => issueCategoryLabel(category, t)).join(", ")}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatTimestamp(review.submittedAt ?? review.updatedAt, locale) ??
                    t("summaryReviewDateUnavailable")}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t("summaryReviewEmpty")}</p>
        )}

        {canReview && !details.reviews.some((review) => review.isOwnReview && review.submittedAt !== null) ? (
          <DocumentSummaryReviewForm
            canDecide={canDecide && evaluation?.status === "completed"}
            documentId={documentId}
            language={language}
            locale={locale}
            pendingReview={pendingReview ?? null}
          />
        ) : null}
      </div>
    </section>
  );
}
