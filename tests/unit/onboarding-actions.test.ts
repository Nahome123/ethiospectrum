import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));
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

describe("onboarding actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            first_name: "Teshome",
            last_name: "Bekele",
            preferred_locale: "am",
          },
        },
      },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: "household-id", error: null });
  });

  it("persists the household with the current consent version and redirects to the locale dashboard", async () => {
    await completeOnboardingAction(
      "am",
      idle,
      formData({ householdName: "  Teshome family  ", consentAccepted: "on" }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("complete_household_onboarding", {
      raw_first_name: "Teshome",
      raw_last_name: "Bekele",
      raw_name: "Teshome family",
      raw_policy_version: ONBOARDING_POLICY_VERSION,
      raw_preferred_locale: "am",
      raw_timezone: "UTC",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.redirect).toHaveBeenCalledWith("/am/dashboard");
  });

  it("returns a localized validation error without touching the database when consent is missing", async () => {
    await expect(
      completeOnboardingAction("en", idle, formData({ householdName: "Teshome family" })),
    ).resolves.toEqual({
      status: "error",
      message: "validationError",
      householdName: "Teshome family",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns a safe generic error and preserves input when persistence fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("private database detail") });
    await expect(
      completeOnboardingAction(
        "es",
        idle,
        formData({ householdName: "Teshome family", consentAccepted: "on" }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "genericError",
      householdName: "Teshome family",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a safe error without calling the onboarding RPC when the session is unavailable", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("session unavailable") });

    await expect(
      completeOnboardingAction(
        "en",
        idle,
        formData({ householdName: "Teshome family", consentAccepted: "on" }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "genericError",
      householdName: "Teshome family",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an unsupported locale before validation", async () => {
    await expect(
      completeOnboardingAction(
        "xx",
        idle,
        formData({ householdName: "Teshome family", consentAccepted: "on" }),
      ),
    ).resolves.toEqual({ status: "error", message: "" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
