import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocumentProcessingSecret: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getDocumentProcessingSecret: mocks.getDocumentProcessingSecret,
}));

import { hasValidDocumentProcessingSecret } from "@/lib/documents/processing/internal-secret";

describe("document processing worker secret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDocumentProcessingSecret.mockReturnValue("correct-secret");
  });

  it("accepts only an exact non-empty secret", () => {
    expect(hasValidDocumentProcessingSecret("correct-secret")).toBe(true);
    expect(hasValidDocumentProcessingSecret("correct-secreT")).toBe(false);
    expect(hasValidDocumentProcessingSecret("correct-secret-extra")).toBe(false);
    expect(hasValidDocumentProcessingSecret(null)).toBe(false);
  });

  it("fails closed when the internal route secret is not configured", () => {
    mocks.getDocumentProcessingSecret.mockReturnValue(undefined);

    expect(hasValidDocumentProcessingSecret("correct-secret")).toBe(false);
  });
});
