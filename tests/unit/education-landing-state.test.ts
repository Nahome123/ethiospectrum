import { describe, expect, it } from "vitest";
import { deriveEducationLandingState } from "@/lib/education/landing-state";

describe("education landing state", () => {
  it("keeps visitors on generic, non-sensitive actions", () => {
    expect(deriveEducationLandingState({ authenticated: false, hasHousehold: false })).toBe("visitor");
  });

  it("guides signed-in users without a household to onboarding", () => {
    expect(deriveEducationLandingState({ authenticated: true, hasHousehold: false })).toBe("needs_household");
  });

  it("guides a signed-in household member back to their workspace", () => {
    expect(deriveEducationLandingState({ authenticated: true, hasHousehold: true })).toBe("ready");
  });
});
