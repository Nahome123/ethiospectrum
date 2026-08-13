import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  canManageBilling,
  canViewBillingInvoices,
  mapSubscriptionEntitlement,
  stripeSubscriptionStatusValues,
} from "@/lib/billing/constants";
import { BillingProviderDataError, mapStripeInvoice, mapStripeSubscription } from "@/lib/billing/mapping";
import { getStripeBillingEnv } from "@/lib/env/server";
import { billingCheckoutSchema } from "@/lib/validation/billing";

function subscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_synthetic123",
    object: "subscription",
    customer: "cus_synthetic123",
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    items: {
      object: "list",
      data: [
        {
          id: "si_synthetic123",
          object: "subscription_item",
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          price: {
            id: "price_monthly123",
            object: "price",
            currency: "usd",
            recurring: { interval: "month" },
          },
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: "/v1/subscription_items",
    },
    ...overrides,
  } as Stripe.Subscription;
}

describe("billing validation and trusted mappings", () => {
  it.each(["month", "year"])("accepts the controlled %s interval", (billingInterval) => {
    expect(billingCheckoutSchema.safeParse({ billingInterval }).success).toBe(true);
  });

  it.each(["price_monthly123", "family_plus", "quarter", "", 12])(
    "rejects browser plan or Price input %j",
    (billingInterval) => {
      expect(billingCheckoutSchema.safeParse({ billingInterval }).success).toBe(false);
    },
  );

  it("grants entitlement only for an active provider subscription", () => {
    for (const status of stripeSubscriptionStatusValues) {
      expect(mapSubscriptionEntitlement(status)).toBe(status === "active" ? "active" : "inactive");
    }
  });

  it("enforces the household billing permission matrix", () => {
    expect(canManageBilling("owner")).toBe(true);
    expect(canManageBilling("administrator")).toBe(false);
    expect(canManageBilling("member")).toBe(false);
    expect(canManageBilling("viewer")).toBe(false);
    expect(canViewBillingInvoices("owner")).toBe(true);
    expect(canViewBillingInvoices("administrator")).toBe(true);
    expect(canViewBillingInvoices("member")).toBe(false);
    expect(canViewBillingInvoices("viewer")).toBe(false);
  });

  it("maps only the configured USD recurring Price", () => {
    const result = mapStripeSubscription(
      subscription(),
      (priceId) => (priceId === "price_monthly123" ? "month" : null),
      "2026-08-10T12:00:00.000Z",
    );
    expect(result).toMatchObject({
      customerId: "cus_synthetic123",
      subscriptionId: "sub_synthetic123",
      priceId: "price_monthly123",
      billingInterval: "month",
      stripeStatus: "active",
      entitlementStatus: "active",
    });
  });

  it("fails closed for an unknown Price", () => {
    expect(() => mapStripeSubscription(subscription(), () => null, new Date().toISOString())).toThrow(
      BillingProviderDataError,
    );
  });

  it("maps safe invoice metadata without card or PDF data", () => {
    const invoice = {
      id: "in_synthetic123",
      object: "invoice",
      customer: "cus_synthetic123",
      parent: {
        type: "subscription_details",
        quote_details: null,
        subscription_details: { subscription: "sub_synthetic123", metadata: null },
      },
      amount_due: 2500,
      amount_paid: 2500,
      currency: "usd",
      status: "paid",
      number: "SYN-0001",
      hosted_invoice_url: "https://invoice.stripe.test/synthetic",
      invoice_pdf: "https://invoice.stripe.test/synthetic.pdf",
      period_start: 1_700_000_000,
      period_end: 1_702_592_000,
      created: 1_700_000_000,
    } as Stripe.Invoice;
    const result = mapStripeInvoice(invoice);
    expect(result.hostedInvoiceUrl).toContain("https://");
    expect(result).not.toHaveProperty("invoicePdfUrl");
    expect(JSON.stringify(result)).not.toMatch(/card|payment_method|cvc/iu);
  });

  it("requires all Stripe server values together and keeps intervals distinct", () => {
    expect(getStripeBillingEnv({})).toBeUndefined();
    expect(() => getStripeBillingEnv({ STRIPE_SECRET_KEY: "sk_test_synthetic" })).toThrow();
    expect(
      getStripeBillingEnv({
        STRIPE_SECRET_KEY: "sk_test_synthetic",
        STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
        STRIPE_FAMILY_PLUS_MONTHLY_PRICE_ID: "price_monthly123",
        STRIPE_FAMILY_PLUS_ANNUAL_PRICE_ID: "price_annual123",
      }),
    ).toMatchObject({ familyPlusMonthlyPriceId: "price_monthly123" });
  });
});
