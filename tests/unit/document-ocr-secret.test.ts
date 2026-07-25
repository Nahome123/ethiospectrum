import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDocumentOcrSecret: vi.fn() }));

vi.mock("@/lib/env/server", () => ({ getDocumentOcrSecret: mocks.getDocumentOcrSecret }));

import { hasValidDocumentOcrSecret } from "@/lib/documents/ocr/internal-secret";

describe("document OCR worker secret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDocumentOcrSecret.mockReturnValue("correct-ocr-secret");
  });

  it("accepts only an exact non-empty OCR secret", () => {
    expect(hasValidDocumentOcrSecret("correct-ocr-secret")).toBe(true);
    expect(hasValidDocumentOcrSecret("correct-ocr-secreT")).toBe(false);
    expect(hasValidDocumentOcrSecret("correct-ocr-secret-extra")).toBe(false);
    expect(hasValidDocumentOcrSecret(null)).toBe(false);
  });

  it("fails closed when the distinct OCR secret is not configured", () => {
    mocks.getDocumentOcrSecret.mockReturnValue(undefined);
    expect(hasValidDocumentOcrSecret("correct-ocr-secret")).toBe(false);
  });
});
