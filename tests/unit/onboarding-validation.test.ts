import { describe, expect, it } from "vitest";
import { createOnboardingSchema } from "@/lib/validation/onboarding";

const messages = { householdName: "household name", consent: "consent" };

describe("onboarding schema", () => {
  it("accepts a valid household name with consent", () =>
    expect(
      createOnboardingSchema(messages).safeParse({
        householdName: "Teshome family",
        consentAccepted: true,
      }).success,
    ).toBe(true));

  it("trims surrounding whitespace from the household name", () => {
    const parsed = createOnboardingSchema(messages).safeParse({
      householdName: "  Teshome family  ",
      consentAccepted: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.householdName).toBe("Teshome family");
  });

  it("rejects an empty or whitespace-only household name", () => {
    expect(
      createOnboardingSchema(messages).safeParse({ householdName: "", consentAccepted: true }).success,
    ).toBe(false);
    expect(
      createOnboardingSchema(messages).safeParse({ householdName: "   ", consentAccepted: true }).success,
    ).toBe(false);
  });

  it("rejects a household name longer than 160 characters", () =>
    expect(
      createOnboardingSchema(messages).safeParse({
        householdName: "a".repeat(161),
        consentAccepted: true,
      }).success,
    ).toBe(false));

  it("rejects a missing consent acknowledgement", () =>
    expect(
      createOnboardingSchema(messages).safeParse({
        householdName: "Teshome family",
        consentAccepted: false,
      }).success,
    ).toBe(false));
});
