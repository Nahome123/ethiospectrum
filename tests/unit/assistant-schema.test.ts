import { describe, expect, it } from "vitest";
import { assistantAnswerSchema } from "@/lib/ai/schemas";

describe("assistant response contract", () => {
  it("requires an explicit evidence state", () => {
    expect(
      assistantAnswerSchema.safeParse({
        answer: "Not enough information.",
        answerLanguage: "en",
        evidenceStrength: "insufficient",
        citations: [],
        generalInformation: [],
        suggestedQuestions: [],
        limitations: ["No authorized source"],
      }).success,
    ).toBe(true);
  });
});
