import { describe, expect, it } from "vitest";
import { getDocumentOcrSecret, getOcrProviderEnv, requireOcrProviderEnv } from "@/lib/env/server";

describe("OCR environment configuration", () => {
  it("allows OCR to remain unconfigured but rejects partial provider configuration", () => {
    expect(getOcrProviderEnv({})).toBeUndefined();
    expect(() => getOcrProviderEnv({ OCR_PROVIDER: "openai" })).toThrow(
      "OCR_PROVIDER, OCR_API_KEY, and OCR_MODEL must be configured together",
    );
    expect(() => getOcrProviderEnv({ OCR_API_KEY: "key", OCR_MODEL: "configured-model" })).toThrow(
      "OCR_PROVIDER, OCR_API_KEY, and OCR_MODEL must be configured together",
    );
  });

  it("accepts only the configured provider and a safe model identifier", () => {
    expect(
      getOcrProviderEnv({ OCR_PROVIDER: "openai", OCR_API_KEY: "key", OCR_MODEL: "configured-model_1" }),
    ).toEqual({ provider: "openai", apiKey: "key", model: "configured-model_1" });
    expect(() =>
      getOcrProviderEnv({ OCR_PROVIDER: "openai", OCR_API_KEY: "key", OCR_MODEL: "model name" }),
    ).toThrow();
  });

  it("requires a distinct, high-entropy OCR invocation secret", () => {
    expect(getDocumentOcrSecret({ DOCUMENT_OCR_SECRET: "" })).toBeUndefined();
    expect(() => getDocumentOcrSecret({ DOCUMENT_OCR_SECRET: "too-short" })).toThrow();
    expect(getDocumentOcrSecret({ DOCUMENT_OCR_SECRET: "x".repeat(32) })).toBe("x".repeat(32));
    expect(() => requireOcrProviderEnv({})).toThrow("OCR_PROVIDER, OCR_API_KEY, and OCR_MODEL");
  });
});
