import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { completeOnboardingAction } from "@/lib/onboarding/actions";
import { ONBOARDING_POLICY_VERSION } from "@/lib/onboarding/policy";

const idle = { status: "idle" } as const;

function formData(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

function validForm(values: Record<string, string> = {}) {
  return formData({
    consentAccepted: "on",
    firstName: "Nahom",
    householdName: "Teshome family",
    lastName: "",
    preferredLocale: "en",
    timezone: "America/New_York",
    ...values,
  });
}

describe("onboarding actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "synthetic-user", role: "member" });
    mocks.rpc.mockResolvedValue({ data: "household-id", error: null });
  });

  it("persists trusted profile and household fields with the current policy, then redirects locally", async () => {
    await completeOnboardingAction(
      "am",
      idle,
      validForm({
        firstName: "  ናሆም  ",
        householdName: "  የናሆም ቤተሰብ  ",
        lastName: "  ተሾመ  ",
        preferredLocale: "am",
        timezone: "Africa/Addis_Ababa",
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("complete_household_onboarding", {
      raw_first_name: "ናሆም",
      raw_last_name: "ተሾመ",
      raw_name: "የናሆም ቤተሰብ",
      raw_policy_version: ONBOARDING_POLICY_VERSION,
      raw_preferred_locale: "am",
      raw_timezone: "Africa/Addis_Ababa",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/am/dashboard");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/am/onboarding");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/am/dependents");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/am/documents");
    expect(mocks.redirect).toHaveBeenCalledWith("/am/dashboard");
  });

  it("ignores browser-supplied household, user, and role fields", async () => {
    await completeOnboardingAction(
      "en",
      idle,
      validForm({
        householdId: "another-household",
        role: "administrator",
        userId: "another-user",
      }),
    );
    const rpcArguments = mocks.rpc.mock.calls[0]?.[1] as Record<string, string>;
    expect(rpcArguments).not.toHaveProperty("householdId");
    expect(rpcArguments).not.toHaveProperty("role");
    expect(rpcArguments).not.toHaveProperty("userId");
  });

  it("returns a localized validation error without touching the database", async () => {
    await expect(completeOnboardingAction("en", idle, validForm({ householdName: "   " }))).resolves.toEqual({
      status: "error",
      message: "validationError",
      householdName: "   ",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("denies a logged-out direct action safely", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    await expect(completeOnboardingAction("en", idle, validForm())).resolves.toEqual({
      status: "error",
      message: "genericError",
      householdName: "Teshome family",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns a safe generic error and preserves input when persistence fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("private database detail") });
    await expect(completeOnboardingAction("es", idle, validForm())).resolves.toEqual({
      status: "error",
      message: "genericError",
      householdName: "Teshome family",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("rejects an unsupported locale before validation", async () => {
    await expect(completeOnboardingAction("xx", idle, validForm())).resolves.toEqual({
      status: "error",
      message: "",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
