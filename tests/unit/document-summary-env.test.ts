import { describe, expect, it } from "vitest";
import { getDocumentSummarySecret, getOpenAiSummaryEnv, requireOpenAiSummaryEnv } from "@/lib/env/server";

describe("document summary server environment", () => {
  it("allows an entirely absent optional provider configuration", () => {
    expect(getOpenAiSummaryEnv({})).toBeUndefined();
  });

  it("fails closed when only part of the provider configuration is present", () => {
    expect(() => getOpenAiSummaryEnv({ OPENAI_API_KEY: "test-key" })).toThrow(
      "OPENAI_API_KEY and OPENAI_SUMMARY_MODEL",
    );
    expect(() => getOpenAiSummaryEnv({ OPENAI_SUMMARY_MODEL: "test-model" })).toThrow(
      "OPENAI_API_KEY and OPENAI_SUMMARY_MODEL",
    );
  });

  it("returns only a complete server-only provider configuration", () => {
    expect(getOpenAiSummaryEnv({ OPENAI_API_KEY: "test-key", OPENAI_SUMMARY_MODEL: "test-model_1" })).toEqual(
      { apiKey: "test-key", model: "test-model_1" },
    );
  });

  it("rejects unsafe model identifiers and missing required provider configuration", () => {
    expect(() =>
      getOpenAiSummaryEnv({ OPENAI_API_KEY: "test-key", OPENAI_SUMMARY_MODEL: "model name" }),
    ).toThrow();
    expect(() => requireOpenAiSummaryEnv({})).toThrow("OPENAI_API_KEY and OPENAI_SUMMARY_MODEL");
  });

  it("requires a distinct high-entropy summary worker secret", () => {
    expect(() => getDocumentSummarySecret({ DOCUMENT_SUMMARY_SECRET: "short" })).toThrow();
    expect(getDocumentSummarySecret({ DOCUMENT_SUMMARY_SECRET: "s".repeat(32) })).toHaveLength(32);
  });
});
