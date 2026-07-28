import { describe, expect, it } from "vitest";
import { getDocumentQuestionSecret, getOpenAiQuestionEnv } from "@/lib/env/server";

describe("document question server environment", () => {
  it("requires complete provider configuration and a separate high-entropy secret", () => {
    expect(getOpenAiQuestionEnv({})).toBeUndefined();
    expect(() => getOpenAiQuestionEnv({ OPENAI_API_KEY: "test-key" })).toThrow("OPENAI_QUESTION_MODEL");
    expect(getOpenAiQuestionEnv({ OPENAI_API_KEY: "test-key", OPENAI_QUESTION_MODEL: "model_1" })).toEqual({
      apiKey: "test-key",
      model: "model_1",
    });
    expect(() => getDocumentQuestionSecret({ DOCUMENT_QUESTION_SECRET: "short" })).toThrow();
    expect(getDocumentQuestionSecret({ DOCUMENT_QUESTION_SECRET: "q".repeat(32) })).toHaveLength(32);
  });
});
