import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";

const source = (file: string) => readFileSync(resolve(file), "utf8");

describe("document summary quality UI boundaries", () => {
  it("keeps quality and review details server-rendered while client forms receive no source content", () => {
    const panel = source("components/documents/document-summary-quality-panel.tsx");
    const evaluationForm = source("components/documents/document-summary-quality-evaluation-form.tsx");
    const reviewForm = source("components/documents/document-summary-review-form.tsx");
    const detailPage = source("app/[locale]/(member)/documents/[documentId]/page.tsx");

    expect(panel.trimStart().startsWith('"use client"')).toBe(false);
    expect(panel).toContain("DocumentSummaryQualityEvaluationForm");
    expect(panel).toContain("DocumentSummaryReviewForm");
    expect(evaluationForm).toContain('"use client"');
    expect(reviewForm).toContain('"use client"');
    expect(evaluationForm).not.toContain("sourceReferences");
    expect(reviewForm).not.toContain("sourceReferences");
    expect(reviewForm).not.toContain("householdId");
    expect(reviewForm).not.toContain("reviewedBy");
    expect(detailPage).toContain("getDocumentSummaryQualityDetails");
    expect(detailPage).toContain("DocumentSummaryQualityPanel");
  });

  it("provides aligned English quality and review vocabulary", () => {
    const messages: Record<string, unknown> = en.documents;
    for (const key of [
      "summaryQualityAndReview",
      "evaluateSummaryQuality",
      "summaryQualityCitationCoverage",
      "summaryReview",
      "summaryReviewApprove",
      "summaryReviewReject",
      "summaryReviewNeedsRevision",
      "summaryReviewDisclaimer",
      "summaryReviewIssueTranslationProblem",
    ]) {
      expect(messages[key]).toEqual(expect.any(String));
    }
  });
});
