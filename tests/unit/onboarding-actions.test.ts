import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  getCurrentHouseholdContext: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
  })),
}));
vi.mock("@/lib/households/server", () => ({
  getCurrentHouseholdContext: mocks.getCurrentHouseholdContext,
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { completeOnboardingAction, updateHouseholdAction } from "@/lib/onboarding/actions";
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
    mocks.getCurrentHouseholdContext.mockResolvedValue({
      household: { id: "household-id", name: "Teshome family" },
      permission: "owner",
      canManage: true,
    });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ is: mocks.is });
    mocks.is.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: { id: "household-id" }, error: null });
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

  it("updates the server-selected household for an owner and redirects to onboarding", async () => {
    await updateHouseholdAction(
      "es",
      idle,
      formData({ householdName: "  Familia Bekele  ", householdId: "forged-household-id" }),
    );

    expect(mocks.update).toHaveBeenCalledWith({ name: "Familia Bekele" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "household-id");
    expect(mocks.is).toHaveBeenCalledWith("deleted_at", null);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/es/onboarding");
    expect(mocks.redirect).toHaveBeenCalledWith("/es/onboarding");
  });

  it("denies household updates to members without management permission", async () => {
    mocks.getCurrentHouseholdContext.mockResolvedValue({
      household: { id: "household-id", name: "Teshome family" },
      permission: "member",
      canManage: false,
    });

    await expect(
      updateHouseholdAction("en", idle, formData({ householdName: "New family name" })),
    ).resolves.toEqual({
      status: "error",
      message: "updateAccessDenied",
      householdName: "New family name",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("validates household updates before loading authorization context", async () => {
    await expect(updateHouseholdAction("am", idle, formData({ householdName: "   " }))).resolves.toEqual({
      status: "error",
      message: "validationError",
      householdName: "   ",
    });
    expect(mocks.getCurrentHouseholdContext).not.toHaveBeenCalled();
  });

  it("returns a safe localized error when the household update fails", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error("private database detail") });

    await expect(
      updateHouseholdAction("en", idle, formData({ householdName: "New family name" })),
    ).resolves.toEqual({
      status: "error",
      message: "updateError",
      householdName: "New family name",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
