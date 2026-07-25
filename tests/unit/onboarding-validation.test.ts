import { describe, expect, it } from "vitest";
import { createOnboardingSchema, isSupportedTimeZone } from "@/lib/validation/onboarding";

const messages = {
  consent: "consent",
  firstName: "first name",
  householdName: "household name",
  lastName: "last name",
  preferredLocale: "preferred locale",
  timezone: "timezone",
};

const validInput = {
  consentAccepted: true,
  firstName: "Nahom",
  householdName: "Teshome family",
  lastName: "",
  preferredLocale: "en",
  timezone: "America/New_York",
};

describe("onboarding schema", () => {
  it("accepts a valid household, profile, locale, and timezone", () =>
    expect(createOnboardingSchema(messages).safeParse(validInput).success).toBe(true));

  it("accepts multilingual personal and household names", () =>
    expect(
      createOnboardingSchema(messages).safeParse({
        ...validInput,
        firstName: "ናሆም",
        householdName: "የናሆም ቤተሰብ",
        lastName: "ተሾመ",
        preferredLocale: "am",
        timezone: "Africa/Addis_Ababa",
      }).success,
    ).toBe(true));

  it("trims surrounding whitespace and leaves an optional last name empty", () => {
    const parsed = createOnboardingSchema(messages).safeParse({
      ...validInput,
      firstName: "  Nahom  ",
      householdName: "  Teshome family  ",
      lastName: "   ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.firstName).toBe("Nahom");
      expect(parsed.data.householdName).toBe("Teshome family");
      expect(parsed.data.lastName).toBe("");
    }
  });

  it("rejects empty or whitespace-only required names", () => {
    expect(createOnboardingSchema(messages).safeParse({ ...validInput, firstName: "   " }).success).toBe(
      false,
    );
    expect(createOnboardingSchema(messages).safeParse({ ...validInput, householdName: "   " }).success).toBe(
      false,
    );
  });

  it("rejects overlong names and household names", () => {
    expect(
      createOnboardingSchema(messages).safeParse({ ...validInput, firstName: "a".repeat(81) }).success,
    ).toBe(false);
    expect(
      createOnboardingSchema(messages).safeParse({ ...validInput, householdName: "a".repeat(161) }).success,
    ).toBe(false);
  });

  it("requires a supported locale, a valid IANA timezone, and consent", () => {
    expect(isSupportedTimeZone("Africa/Addis_Ababa")).toBe(true);
    expect(isSupportedTimeZone("not/a-timezone")).toBe(false);
    expect(createOnboardingSchema(messages).safeParse({ ...validInput, preferredLocale: "fr" }).success).toBe(
      false,
    );
    expect(
      createOnboardingSchema(messages).safeParse({ ...validInput, timezone: "not/a-timezone" }).success,
    ).toBe(false);
    expect(
      createOnboardingSchema(messages).safeParse({ ...validInput, consentAccepted: false }).success,
    ).toBe(false);
  });
});
