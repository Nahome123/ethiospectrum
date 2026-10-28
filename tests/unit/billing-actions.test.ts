import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  revalidatePath: vi.fn(),
  getSiteUrl: vi.fn(),
  getHouseholdAccess: vi.fn(),
  getCurrentSupabaseClaims: vi.fn(),
  getCurrentUserRole: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getStripeClient: vi.fn(),
  getRbtCoursePriceId: vi.fn(),
  courseStatus: vi.fn(),
  isStripeAutomaticTaxEnabled: vi.fn(),
  getConfiguredBillingInterval: vi.fn(),
  reconcileBillingHousehold: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/site-url", () => ({ getSiteUrl: mocks.getSiteUrl }));
vi.mock("@/lib/households/server", () => ({
  getHouseholdAccess: mocks.getHouseholdAccess,
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
  getRbtCoursePriceId: mocks.getRbtCoursePriceId,
  isStripeAutomaticTaxEnabled: mocks.isStripeAutomaticTaxEnabled,
  getConfiguredBillingInterval: mocks.getConfiguredBillingInterval,
}));
vi.mock("@/lib/billing/sync", () => ({ reconcileBillingHousehold: mocks.reconcileBillingHousehold }));
vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({
    rpc: vi.fn(async () => ({ data: [mocks.courseStatus()], error: null })),
  })),
}));

import {
  createBillingPortalSessionAction,
  startTrainingCourseCheckoutAction,
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
    mocks.getHouseholdAccess.mockResolvedValue({
      household: { id: householdId, name: "Synthetic household" },
      permission: "owner",
      isOwner: true,
      permissions: ["submit_requests", "make_payments", "manage_subscription"],
    });
    mocks.getCurrentSupabaseClaims.mockResolvedValue({ sub: userId });
    mocks.getRbtCoursePriceId.mockReturnValue("price_course_server");
    mocks.courseStatus.mockReturnValue({ can_purchase: true, renewable: true, access_expires_at: null });
    mocks.isStripeAutomaticTaxEnabled.mockReturnValue(false);
    mocks.getConfiguredBillingInterval.mockImplementation((price: string) =>
      price === "price_monthly_server" ? "month" : null,
    );
  });

  it("buys the course with a one-time Checkout for the server-configured Price", async () => {
    const admin = adminClient();
    const checkoutCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.getStripeClient.mockReturnValue({ checkout: { sessions: { create: checkoutCreate } } });

    await expect(startTrainingCourseCheckoutAction("en", idle, checkoutForm())).resolves.toEqual({
      status: "success",
      message: "checkout.redirecting",
      url: "https://checkout.stripe.test/session",
    });
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        customer: "cus_synthetic123",
        line_items: [{ price: "price_course_server", quantity: 1 }],
        metadata: expect.objectContaining({
          ethiospectrum_training_course: "rbt_bootcamp",
          ethiospectrum_household_id: householdId,
        }),
        payment_intent_data: {
          metadata: expect.objectContaining({ ethiospectrum_training_course: "rbt_bootcamp" }),
        },
        success_url: "http://localhost:3000/en/billing?checkout=success",
        cancel_url: "http://localhost:3000/en/billing?checkout=cancelled",
      }),
    );
    const calls = JSON.stringify(checkoutCreate.mock.calls);
    expect(calls).not.toContain("price_forged_browser");
    expect(calls).not.toContain("forged-household");
    expect(calls).not.toMatch(/dependent|diagnos|appointment|support.?request/iu);
  });

  it("refuses to sell another year while most of the current one is left", async () => {
    mocks.courseStatus.mockReturnValue({
      can_purchase: true,
      renewable: false,
      access_expires_at: "2027-09-01T00:00:00Z",
    });
    await expect(startTrainingCourseCheckoutAction("en", idle, checkoutForm())).resolves.toEqual({
      status: "error",
      message: "errors.courseActive",
    });
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });

  it.each(["administrator", "member", "viewer"])(
    "denies a %s without the billing permission before Stripe access",
    async (permission) => {
      mocks.getHouseholdAccess.mockResolvedValue({
        household: { id: householdId, name: "Synthetic household" },
        permission,
        isOwner: false,
        permissions: ["submit_requests", "access_training"],
      });
      await expect(startTrainingCourseCheckoutAction("en", idle, checkoutForm())).resolves.toEqual({
        status: "error",
        message: "errors.ownerRequired",
      });
      expect(mocks.getStripeClient).not.toHaveBeenCalled();
    },
  );

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
    for (const role of ["specialist"] as const) {
      mocks.getCurrentUserRole.mockResolvedValue(role);
      await expect(reconcileBillingHouseholdAction("en", idle, form)).resolves.toEqual({
        status: "error",
        message: "errors.adminRequired",
      });
    }
    expect(mocks.reconcileBillingHousehold).not.toHaveBeenCalled();
  });
});
