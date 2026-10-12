import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHouseholdAccess: vi.fn(),
  getCurrentSupabaseClaims: vi.fn(),
  getCurrentUserRole: vi.fn(),
  findLiveHouseholdSubscription: vi.fn(),
  setCancelAtPeriodEnd: vi.fn(),
  cancelSubscriptionNow: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/site-url", () => ({ getSiteUrl: () => "http://localhost:3000" }));
vi.mock("@/lib/households/server", () => ({ getHouseholdAccess: mocks.getHouseholdAccess }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentSupabaseClaims: mocks.getCurrentSupabaseClaims,
  getCurrentUserRole: mocks.getCurrentUserRole,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));
vi.mock("@/lib/billing/provider", () => ({
  getStripeClient: () => ({}),
  getRbtMonthlyPriceId: vi.fn(),
  getConfiguredBillingInterval: vi.fn(),
}));
vi.mock("@/lib/billing/sync", () => ({ reconcileBillingHousehold: vi.fn() }));
vi.mock("@/lib/billing/subscription-control", () => ({
  findLiveHouseholdSubscription: mocks.findLiveHouseholdSubscription,
  setCancelAtPeriodEnd: mocks.setCancelAtPeriodEnd,
  cancelSubscriptionNow: mocks.cancelSubscriptionNow,
}));

import { adminEndMembershipAction, setSubscriptionCancellationAction } from "@/lib/billing/actions";

const idle = { status: "idle" } as const;
const householdId = "d2000000-0000-4000-8000-000000000001";
const live = {
  subscriptionId: "sub_live123",
  stripeStatus: "active",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
};

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("ending a subscription in the app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ error: null });
    mocks.getCurrentSupabaseClaims.mockResolvedValue({ sub: "user-1" });
    mocks.getHouseholdAccess.mockResolvedValue({
      household: { id: householdId, name: "Household" },
      permission: "owner",
      isOwner: true,
      permissions: ["manage_subscription"],
    });
    mocks.findLiveHouseholdSubscription.mockResolvedValue(live);
  });

  it("lets the owner cancel at the end of the paid period", async () => {
    await expect(setSubscriptionCancellationAction("en", true, idle, form())).resolves.toEqual({
      status: "success",
      message: "cancel.scheduled",
    });
    expect(mocks.setCancelAtPeriodEnd).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub_live123", cancel: true }),
    );
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "subscription_cancellation_scheduled", household_id: householdId }),
    );
  });

  it("lets the owner resume a scheduled cancellation", async () => {
    mocks.findLiveHouseholdSubscription.mockResolvedValue({ ...live, cancelAtPeriodEnd: true });
    await expect(setSubscriptionCancellationAction("en", false, idle, form())).resolves.toMatchObject({
      message: "cancel.resumed",
    });
    expect(mocks.setCancelAtPeriodEnd).toHaveBeenCalledWith(expect.objectContaining({ cancel: false }));
  });

  it("refuses someone without subscription permission", async () => {
    mocks.getHouseholdAccess.mockResolvedValue({
      household: { id: householdId, name: "Household" },
      permission: "member",
      isOwner: false,
      permissions: ["submit_requests"],
    });
    await expect(setSubscriptionCancellationAction("en", true, idle, form())).resolves.toMatchObject({
      status: "error",
    });
    expect(mocks.setCancelAtPeriodEnd).not.toHaveBeenCalled();
  });

  it("only administrators can end a membership", async () => {
    mocks.getCurrentUserRole.mockResolvedValue("member");
    await expect(
      adminEndMembershipAction("en", householdId, idle, form({ mode: "now" })),
    ).resolves.toMatchObject({
      status: "error",
      message: "errors.adminRequired",
    });
    expect(mocks.cancelSubscriptionNow).not.toHaveBeenCalled();
  });

  it("an administrator can end a membership immediately or at period end", async () => {
    mocks.getCurrentUserRole.mockResolvedValue("administrator");
    await adminEndMembershipAction("en", householdId, idle, form({ mode: "now" }));
    expect(mocks.cancelSubscriptionNow).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub_live123" }),
    );
    await adminEndMembershipAction("en", householdId, idle, form({ mode: "period_end" }));
    expect(mocks.setCancelAtPeriodEnd).toHaveBeenCalledWith(expect.objectContaining({ cancel: true }));
  });

  it("rejects an unknown end mode", async () => {
    mocks.getCurrentUserRole.mockResolvedValue("administrator");
    await expect(
      adminEndMembershipAction("en", householdId, idle, form({ mode: "yesterday" })),
    ).resolves.toMatchObject({
      message: "errors.validation",
    });
  });
});
