import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocumentSummarySecret: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getDocumentSummarySecret: mocks.getDocumentSummarySecret,
}));

import { hasValidDocumentSummarySecret } from "@/lib/documents/summaries/internal-secret";

describe("document summary worker secret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDocumentSummarySecret.mockReturnValue("correct-summary-secret");
  });

  it("accepts only an exact non-empty dedicated secret", () => {
    expect(hasValidDocumentSummarySecret("correct-summary-secret")).toBe(true);
    expect(hasValidDocumentSummarySecret("correct-summary-secreT")).toBe(false);
    expect(hasValidDocumentSummarySecret("correct-summary-secret-extra")).toBe(false);
    expect(hasValidDocumentSummarySecret(null)).toBe(false);
  });

  it("fails closed when the dedicated summary secret is missing", () => {
    mocks.getDocumentSummarySecret.mockReturnValue(undefined);

    expect(hasValidDocumentSummarySecret("correct-summary-secret")).toBe(false);
  });
});
