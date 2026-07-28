"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { submitDocumentSummaryReviewAction } from "@/lib/documents/summary-quality-actions";
import { initialDocumentSummaryQualityActionState } from "@/lib/documents/summary-quality-action-state";
import {
  DOCUMENT_SUMMARY_REVIEW_ISSUE_CATEGORIES,
  type DocumentSummaryReviewIssueCategory,
} from "@/lib/documents/summary-quality-schemas";

type PendingReview = {
  overallRating: number | null;
  accuracyRating: number | null;
  completenessRating: number | null;
  citationRating: number | null;
  languageRating: number | null;
  issueCategories: readonly DocumentSummaryReviewIssueCategory[];
  feedback: string | null;
};

function RatingField({
  defaultValue,
  id,
  label,
}: {
  defaultValue: number | null;
  id: string;
  label: string;
}) {
  return (
    <div className="grid gap-1">
      <label className="text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      <select
        className="h-10 rounded-md border bg-background px-3 text-sm"
        defaultValue={defaultValue ?? ""}
        id={id}
        name={id}
      >
        <option value="">—</option>
        {[1, 2, 3, 4, 5].map((rating) => (
          <option key={rating} value={rating}>
            {rating}
          </option>
        ))}
      </select>
    </div>
  );
}

function issueCategoryLabel(
  category: DocumentSummaryReviewIssueCategory,
  t: ReturnType<typeof useTranslations>,
): string {
  const key = `summaryReviewIssue${category
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("")}` as const;
  return t(key);
}

/** The browser supplies only validated review form fields; the RPC derives identity and household. */
export function DocumentSummaryReviewForm({
  canDecide,
  documentId,
  language,
  locale,
  pendingReview,
}: {
  canDecide: boolean;
  documentId: string;
  language: string;
  locale: AppLocale;
  pendingReview: PendingReview | null;
}) {
  const t = useTranslations("documents");
  const [state, action, pending] = useActionState(
    submitDocumentSummaryReviewAction.bind(null, locale, documentId, language),
    initialDocumentSummaryQualityActionState,
  );

  return (
    <form action={action} aria-busy={pending} className="mt-5 grid gap-5 rounded-xl border bg-background p-4">
      <fieldset disabled={pending}>
        <legend className="text-base font-semibold">{t("summaryReviewYourAssessment")}</legend>
        <p className="mt-1 text-sm text-muted-foreground">{t("summaryReviewRatingHelp")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RatingField
            defaultValue={pendingReview?.overallRating ?? null}
            id="overallRating"
            label={t("summaryReviewOverallRating")}
          />
          <RatingField
            defaultValue={pendingReview?.accuracyRating ?? null}
            id="accuracyRating"
            label={t("summaryReviewAccuracyRating")}
          />
          <RatingField
            defaultValue={pendingReview?.completenessRating ?? null}
            id="completenessRating"
            label={t("summaryReviewCompletenessRating")}
          />
          <RatingField
            defaultValue={pendingReview?.citationRating ?? null}
            id="citationRating"
            label={t("summaryReviewCitationRating")}
          />
          <RatingField
            defaultValue={pendingReview?.languageRating ?? null}
            id="languageRating"
            label={t("summaryReviewLanguageRating")}
          />
        </div>
      </fieldset>

      <fieldset disabled={pending}>
        <legend className="text-sm font-semibold">{t("summaryReviewIssueCategories")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {DOCUMENT_SUMMARY_REVIEW_ISSUE_CATEGORIES.map((category) => (
            <label className="flex items-start gap-2 text-sm" key={category}>
              <input
                className="mt-1 size-4"
                defaultChecked={pendingReview?.issueCategories.includes(category) ?? false}
                name="issueCategories"
                type="checkbox"
                value={category}
              />
              <span>{issueCategoryLabel(category, t)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-1">
        <label className="text-sm font-semibold" htmlFor="summary-review-feedback">
          {t("summaryReviewFeedback")}
        </label>
        <textarea
          className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm"
          defaultValue={pendingReview?.feedback ?? ""}
          id="summary-review-feedback"
          maxLength={2000}
          name="feedback"
        />
        <p className="text-sm text-muted-foreground">{t("summaryReviewFeedbackHelp")}</p>
      </div>

      {canDecide ? (
        <div className="grid gap-1 sm:max-w-sm">
          <label className="text-sm font-semibold" htmlFor="summary-review-decision">
            {t("summaryReviewDecision")}
          </label>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            defaultValue=""
            id="summary-review-decision"
            name="decision"
          >
            <option value="">{t("summaryReviewSaveFeedback")}</option>
            <option value="approved">{t("summaryReviewApprove")}</option>
            <option value="rejected">{t("summaryReviewReject")}</option>
            <option value="needs_revision">{t("summaryReviewNeedsRevision")}</option>
          </select>
          <p className="text-sm text-muted-foreground">{t("summaryReviewDecisionHelp")}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} type="submit">
          {pending ? t("summaryReviewSaving") : t("summaryReviewSave")}
        </Button>
        {state.status !== "idle" ? (
          <p
            className={
              state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
            }
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
