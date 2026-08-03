import { describe, expect, it } from "vitest";
import {
  formatTranslationUpdatedAt,
  parentStatus,
  translationDashboardRow,
} from "@/lib/resources/translation-dashboard";

describe("translation dashboard model", () => {
  it.each(["draft", "in_review", "published", "archived"] as const)(
    "returns authoritative %s parent status",
    (status) => {
      expect(parentStatus(status)).toBe(status);
    },
  );
  it("safely rejects an unsupported parent status", () => {
    expect(parentStatus("unknown")).toBeNull();
  });
  it("formats existing translations on the server model", () => {
    const row = translationDashboardRow(
      "am",
      {
        locale: "am",
        review_status: "draft",
        source_translation_version: 3,
        updated_at: "2026-08-03T12:00:00.000Z",
      },
      3,
      "en",
    );
    expect(row.workflowState).toBe("draft");
    expect(row.formattedLastUpdated).toBeTruthy();
    expect(row.formattedLastUpdated).not.toContain("2026-08-03T");
  });
  it("marks missing and invalid timestamps as not displayable", () => {
    expect(translationDashboardRow("es", null, 3, "es").workflowState).toBe("notStarted");
    expect(formatTranslationUpdatedAt("invalid", "am")).toBeNull();
  });
  it("derives stale state from source version, not workflow state", () => {
    expect(
      translationDashboardRow(
        "es",
        { locale: "es", review_status: "approved", source_translation_version: 2, updated_at: null },
        3,
        "es",
      ).workflowState,
    ).toBe("stale");
  });
});
