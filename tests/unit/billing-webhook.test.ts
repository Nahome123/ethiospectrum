import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  syncStripeSubscription: vi.fn(),
  syncStripeInvoice: vi.fn(),
}));

vi.mock("@/lib/billing/sync", () => ({
  syncStripeSubscription: mocks.syncStripeSubscription,
  syncStripeInvoice: mocks.syncStripeInvoice,
}));

import { handleStripeWebhookRequest } from "@/lib/billing/webhook";

function stripeWithEvent(event: Stripe.Event | Error) {
  return {
    webhooks: {
      constructEvent: vi.fn(() => {
        if (event instanceof Error) throw event;
        return event;
      }),
    },
  } as unknown as Stripe;
}

function event(type: string, object: object = { id: "sub_synthetic123" }): Stripe.Event {
  return {
    id: "evt_synthetic123",
    object: "event",
    api_version: "2026-07-01",
    created: 1_700_000_000,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
  } as Stripe.Event;
}

function request() {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "synthetic-signature" },
    body: "synthetic-raw-body",
  });
}

describe("Stripe webhook boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects missing and invalid signatures before database access", async () => {
    const admin = { rpc: vi.fn() };
    const missing = new Request("http://localhost/api/stripe/webhook", { method: "POST" });
    expect(
      (
        await handleStripeWebhookRequest(missing, {
          stripe: stripeWithEvent(event("x")),
          admin: admin as never,
          webhookSecret: "whsec_test",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await handleStripeWebhookRequest(request(), {
          stripe: stripeWithEvent(new Error("invalid")),
          admin: admin as never,
          webhookSecret: "whsec_test",
        })
      ).status,
    ).toBe(400);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("safely ignores signed unrecognized events", async () => {
    const admin = { rpc: vi.fn() };
    const response = await handleStripeWebhookRequest(request(), {
      stripe: stripeWithEvent(event("customer.created")),
      admin: admin as never,
      webhookSecret: "whsec_test",
    });
    expect(response.status).toBe(200);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("returns success for an already processed duplicate", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "duplicate", error: null });
    const response = await handleStripeWebhookRequest(request(), {
      stripe: stripeWithEvent(event("customer.subscription.updated")),
      admin: { rpc } as never,
      webhookSecret: "whsec_test",
    });
    expect(response.status).toBe(200);
    expect(mocks.syncStripeSubscription).not.toHaveBeenCalled();
  });

  it("refetches and synchronizes a subscription before marking the event processed", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: "process", error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.syncStripeSubscription.mockResolvedValue("household-synthetic");
    const response = await handleStripeWebhookRequest(request(), {
      stripe: stripeWithEvent(event("customer.subscription.updated")),
      admin: { rpc } as never,
      webhookSecret: "whsec_test",
    });
    expect(response.status).toBe(200);
    expect(mocks.syncStripeSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub_synthetic123" }),
    );
    expect(rpc).toHaveBeenLastCalledWith("complete_stripe_webhook_event", {
      input_stripe_event_id: "evt_synthetic123",
    });
  });

  it("does not grant entitlement from a Checkout event without a subscription", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: "process", error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const response = await handleStripeWebhookRequest(request(), {
      stripe: stripeWithEvent(event("checkout.session.completed", { id: "cs_test", subscription: null })),
      admin: { rpc } as never,
      webhookSecret: "whsec_test",
    });
    expect(response.status).toBe(200);
    expect(mocks.syncStripeSubscription).not.toHaveBeenCalled();
  });

  it("records a safe failure state and lets Stripe retry", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: "process", error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.syncStripeInvoice.mockRejectedValue(new Error("private provider detail"));
    const response = await handleStripeWebhookRequest(request(), {
      stripe: stripeWithEvent(event("invoice.payment_failed", { id: "in_synthetic123" })),
      admin: { rpc } as never,
      webhookSecret: "whsec_test",
    });
    expect(response.status).toBe(503);
    expect(rpc).toHaveBeenLastCalledWith("fail_stripe_webhook_event", {
      input_stripe_event_id: "evt_synthetic123",
      input_error_code: "webhook_processing_failed",
      target_household_id: undefined,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("private provider detail");
  });
});
