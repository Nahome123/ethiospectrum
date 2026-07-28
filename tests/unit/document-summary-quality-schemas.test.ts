import { describe, expect, it } from "vitest";
import { documentSummaryReviewSubmissionSchema } from "@/lib/documents/summary-quality-schemas";

const validDecision = {
  overallRating: 5,
  accuracyRating: 4,
  completenessRating: 4,
  citationRating: 5,
  languageRating: 4,
  issueCategories: ["translation_problem"] as const,
  feedback: "Resumen en español: información clara.",
  decision: "approved" as const,
};

describe("document summary quality review validation", () => {
  it("accepts controlled ratings, Unicode feedback, and supported issue categories", () => {
    expect(
      documentSummaryReviewSubmissionSchema.safeParse({
        ...validDecision,
        feedback: "የማጠቃለያው ግምገማ ግልጽ ነው።",
      }).success,
    ).toBe(true);
  });

  it("rejects whitespace-only feedback when it is the only submitted value", () => {
    expect(
      documentSummaryReviewSubmissionSchema.safeParse({
        overallRating: null,
        accuracyRating: null,
        completenessRating: null,
        citationRating: null,
        languageRating: null,
        issueCategories: [],
        feedback: "   ",
        decision: null,
      }).success,
    ).toBe(false);
  });

  it("requires all ratings for a household decision and rejects browser-invented categories", () => {
    expect(
      documentSummaryReviewSubmissionSchema.safeParse({ ...validDecision, citationRating: null }).success,
    ).toBe(false);
    expect(
      documentSummaryReviewSubmissionSchema.safeParse({
        ...validDecision,
        issueCategories: ["browser_supplied_privilege"],
      }).success,
    ).toBe(false);
  });

  it("rejects feedback beyond the controlled private-content limit", () => {
    expect(
      documentSummaryReviewSubmissionSchema.safeParse({ ...validDecision, feedback: "x".repeat(2001) })
        .success,
    ).toBe(false);
  });
});
