import { z } from "zod";

export const DOCUMENT_SUMMARY_REVIEW_ISSUE_CATEGORIES = [
  "incorrect_fact",
  "missing_information",
  "unsupported_claim",
  "incorrect_date",
  "incorrect_person_or_organization",
  "citation_missing",
  "citation_incorrect",
  "language_quality",
  "translation_problem",
  "unsafe_or_misleading",
  "other",
] as const;

export type DocumentSummaryReviewIssueCategory = (typeof DOCUMENT_SUMMARY_REVIEW_ISSUE_CATEGORIES)[number];

export const documentSummaryReviewDecisionSchema = z.enum(["approved", "rejected", "needs_revision"]);

const ratingSchema = z.number().int().min(1).max(5).nullable();
const optionalFeedbackSchema = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .transform((value) => value || null);

export const documentSummaryReviewSubmissionSchema = z
  .object({
    overallRating: ratingSchema,
    accuracyRating: ratingSchema,
    completenessRating: ratingSchema,
    citationRating: ratingSchema,
    languageRating: ratingSchema,
    issueCategories: z.array(z.enum(DOCUMENT_SUMMARY_REVIEW_ISSUE_CATEGORIES)).max(12),
    feedback: optionalFeedbackSchema,
    decision: documentSummaryReviewDecisionSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasContent =
      value.overallRating !== null ||
      value.accuracyRating !== null ||
      value.completenessRating !== null ||
      value.citationRating !== null ||
      value.languageRating !== null ||
      value.issueCategories.length > 0 ||
      value.feedback !== null;
    if (!hasContent) {
      context.addIssue({ code: "custom", message: "A review needs feedback, an issue, or a rating." });
    }
    if (
      value.decision !== null &&
      [
        value.overallRating,
        value.accuracyRating,
        value.completenessRating,
        value.citationRating,
        value.languageRating,
      ].some((rating) => rating === null)
    ) {
      context.addIssue({ code: "custom", message: "A decision requires all ratings." });
    }
  });

export type DocumentSummaryQualityWarning =
  | "partial_document"
  | "invalid_structured_summary"
  | "invalid_source_reference_format"
  | "invalid_or_cross_document_reference"
  | "summary_has_no_citable_content"
  | "missing_citations"
  | "suspiciously_short_summary"
  | "output_length_invalid"
  | "unsafe_markup_detected";

export const documentSummaryQualityWarningsSchema = z.array(
  z.enum([
    "partial_document",
    "invalid_structured_summary",
    "invalid_source_reference_format",
    "invalid_or_cross_document_reference",
    "summary_has_no_citable_content",
    "missing_citations",
    "suspiciously_short_summary",
    "output_length_invalid",
    "unsafe_markup_detected",
  ]),
);

const qualityChecksSchema = z
  .object({
    citationStatements: z.number().int().nonnegative(),
    citedStatements: z.number().int().nonnegative(),
    fullDocumentAnalysed: z.boolean(),
    partialDocument: z.boolean(),
    sameDocumentReferencesValid: z.boolean(),
    sourceReferencesValidJson: z.boolean(),
    structuredSummaryValid: z.boolean(),
  })
  .strict()
  .passthrough();

export function parseDocumentSummaryQualityChecks(value: unknown) {
  const parsed = qualityChecksSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
