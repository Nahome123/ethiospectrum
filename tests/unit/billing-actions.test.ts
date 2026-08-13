import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  revalidatePath: vi.fn(),
  getSiteUrl: vi.fn(),
  getCurrentHouseholdContext: vi.fn(),
  getCurrentSupabaseClaims: vi.fn(),
  getCurrentUserRole: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getStripeClient: vi.fn(),
  getStripePriceId: vi.fn(),
  getConfiguredBillingInterval: vi.fn(),
  reconcileBillingHousehold: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/site-url", () => ({ getSiteUrl: mocks.getSiteUrl }));
vi.mock("@/lib/households/server", () => ({
  getCurrentHouseholdContext: mocks.getCurrentHouseholdContext,
}));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentSupabaseClaims: mocks.getCurrentSupabaseClaims,
  getCurrentUserRole: mocks.getCurrentUserRole,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/billing/provider", () => ({
  getStripeClient: mocks.getStripeClient,
  getStripePriceId: mocks.getStripePriceId,
  getConfiguredBillingInterval: mocks.getConfiguredBillingInterval,
}));
vi.mock("@/lib/billing/sync", () => ({ reconcileBillingHousehold: mocks.reconcileBillingHousehold }));

import {
  createBillingCheckoutSessionAction,
  createBillingPortalSessionAction,
  reconcileBillingHouseholdAction,
} from "@/lib/billing/actions";

const idle = { status: "idle" } as const;
const householdId = "d2000000-0000-4000-8000-000000000001";
const userId = "d1000000-0000-4000-8000-000000000001";

function checkoutForm(interval = "month") {
  const form = new FormData();
  form.set("billingInterval", interval);
  form.set("priceId", "price_forged_browser");
  form.set("householdId", "forged-household");
  form.set("stripeCustomerId", "cus_forged");
  return form;
}

function adminClient(customerId: string | null = "cus_synthetic123") {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: customerId ? { stripe_customer_id: customerId } : null,
    error: null,
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return { from: vi.fn(() => ({ select })), rpc };
}

describe("billing Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getSiteUrl.mockReturnValue("http://localhost:3000");
    mocks.getCurrentHouseholdContext.mockResolvedValue({
      household: { id: householdId, name: "Synthetic household" },
      permission: "owner",
      canManage: true,
    });
    mocks.getCurrentSupabaseClaims.mockResolvedValue({ sub: userId });
    mocks.getStripePriceId.mockReturnValue("price_monthly_server");
    mocks.getConfiguredBillingInterval.mockImplementation((price: string) =>
      price === "price_monthly_server" ? "month" : null,
    );
  });

  it("creates hosted Checkout with a server-resolved Price and safe metadata", async () => {
    const admin = adminClient();
    const checkoutCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    const stripe = {
      subscriptions: { list: vi.fn().mockResolvedValue({ data: [] }) },
      checkout: { sessions: { create: checkoutCreate } },
    };
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.getStripeClient.mockReturnValue(stripe);

    await expect(createBillingCheckoutSessionAction("en", idle, checkoutForm())).resolves.toEqual({
      status: "success",
      message: "checkout.redirecting",
      url: "https://checkout.stripe.test/session",
    });
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_synthetic123",
        line_items: [{ price: "price_monthly_server", quantity: 1 }],
        success_url: "http://localhost:3000/en/billing?checkout=success",
        cancel_url: "http://localhost:3000/en/billing?checkout=cancelled",
      }),
    );
    const calls = JSON.stringify(checkoutCreate.mock.calls);
    expect(calls).not.toContain("price_forged_browser");
    expect(calls).not.toContain("forged-household");
    expect(calls).not.toMatch(/dependent|diagnos|appointment|support.?request/iu);
  });

  it.each(["administrator", "member", "viewer"])(
    "denies %s Checkout before Stripe access",
    async (permission) => {
      mocks.getCurrentHouseholdContext.mockResolvedValue({
        household: { id: householdId, name: "Synthetic household" },
        permission,
        canManage: permission === "administrator",
      });
      await expect(createBillingCheckoutSessionAction("en", idle, checkoutForm())).resolves.toEqual({
        status: "error",
        message: "errors.ownerRequired",
      });
      expect(mocks.getStripeClient).not.toHaveBeenCalled();
    },
  );

  it("rejects arbitrary interval and Price input before provider access", async () => {
    await expect(
      createBillingCheckoutSessionAction("en", idle, checkoutForm("price_forged_browser")),
    ).resolves.toEqual({ status: "error", message: "errors.validation" });
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });

  it("opens only the stored customer's Stripe portal", async () => {
    const admin = adminClient();
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.test/portal" });
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.getStripeClient.mockReturnValue({ billingPortal: { sessions: { create } } });
    await expect(createBillingPortalSessionAction("es", idle, new FormData())).resolves.toEqual({
      status: "success",
      message: "portal.redirecting",
      url: "https://billing.stripe.test/portal",
    });
    expect(create).toHaveBeenCalledWith({
      customer: "cus_synthetic123",
      return_url: "http://localhost:3000/es/billing",
    });
  });

  it("allows only a platform administrator to reconcile a selected local household", async () => {
    mocks.getCurrentUserRole.mockResolvedValue("administrator");
    mocks.createSupabaseAdminClient.mockReturnValue({ marker: "admin" });
    mocks.getStripeClient.mockReturnValue({ marker: "stripe" });
    mocks.reconcileBillingHousehold.mockResolvedValue(undefined);
    const form = new FormData();
    form.set("householdId", householdId);
    form.set("stripeCustomerId", "cus_forged_browser");
    await expect(reconcileBillingHouseholdAction("en", idle, form)).resolves.toEqual({
      status: "success",
      message: "admin.reconciled",
    });
    expect(mocks.reconcileBillingHousehold).toHaveBeenCalledWith(
      expect.objectContaining({ householdId, actorId: userId }),
    );
    expect(JSON.stringify(mocks.reconcileBillingHousehold.mock.calls)).not.toContain("cus_forged_browser");
  });

  it("denies content editors and specialists from reconciliation", async () => {
    const form = new FormData();
    form.set("householdId", householdId);
    for (const role of ["content_editor", "specialist"] as const) {
      mocks.getCurrentUserRole.mockResolvedValue(role);
      await expect(reconcileBillingHouseholdAction("en", idle, form)).resolves.toEqual({
        status: "error",
        message: "errors.adminRequired",
      });
    }
    expect(mocks.reconcileBillingHousehold).not.toHaveBeenCalled();
  });
});
