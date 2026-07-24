import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";

const source = (file: string) => readFileSync(resolve(file), "utf8");

describe("document summary UI boundaries", () => {
  it("keeps summary text and citations in a Server Component while the request form receives no summary data", () => {
    const panel = source("components/documents/document-summary-panel.tsx");
    const requestForm = source("components/documents/document-summary-request-form.tsx");
    const detailPage = source("app/[locale]/(member)/documents/[documentId]/page.tsx");

    expect(panel.trimStart().startsWith('"use client"')).toBe(false);
    expect(panel).toContain("DocumentSummaryStatusBadge");
    expect(panel).toContain("SourceReferences");
    expect(panel).toContain("StatementSourceLinks");
    expect(panel).toContain('t("summaryTranslationVerification")');
    expect(panel).toContain('method="get"');
    expect(panel).toContain('name="summaryLanguage"');
    expect(requestForm.trimStart().startsWith('"use client";')).toBe(true);
    expect(requestForm).toContain('from "@/lib/documents/summary-actions"');
    expect(requestForm).toContain('from "@/lib/documents/summary-action-state"');
    expect(requestForm).not.toContain("structuredSummary");
    expect(requestForm).not.toContain("sourceReferences");
    expect(requestForm).not.toContain("excerpt");
    expect(detailPage).toContain("getDocumentSummaryDetails");
    expect(detailPage).toContain("getDocumentSummaryEligibility");
    expect(detailPage).toContain("DocumentSummaryPanel");
    expect(detailPage).toContain("documentSummaryLanguageSchema.safeParse");
  });

  it("provides the required localized document-summary vocabulary", () => {
    const documentMessages: Record<string, unknown> = en.documents;
    const requiredKeys = [
      "documentSummary",
      "generateSummary",
      "generateAgain",
      "summaryLanguage",
      "languageEnglish",
      "languageAmharic",
      "languageSpanish",
      "summaryQueued",
      "generatingSummary",
      "summaryCompleted",
      "summaryFailed",
      "retrySummary",
      "overview",
      "keyPoints",
      "importantDates",
      "actionItems",
      "organizationsAndPeople",
      "warningsAndUncertainties",
      "sources",
      "page",
      "section",
      "generated",
      "verifyWithOriginalDocument",
      "processingRequired",
      "ocrRequired",
      "summaryUnavailable",
      "partialDocumentSummary",
      "summaryMayContainErrors",
      "summaryTranslationVerification",
    ];

    for (const key of requiredKeys) {
      expect(documentMessages[key]).toEqual(expect.any(String));
    }
  });
});
