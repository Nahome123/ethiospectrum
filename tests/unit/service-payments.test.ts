import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapCheckoutSessionOutcome,
  safeProviderCode,
  syncServicePaymentFromSession,
} from "@/lib/services/payments";

function session(overrides: Partial<Stripe.Checkout.Session>): Stripe.Checkout.Session {
  return {
    id: "cs_test_synthetic",
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: 999,
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
    metadata: { ethiospectrum_payment_id: "20000000-0000-4000-8000-000000000001" },
    payment_intent: { id: "pi_test_synthetic", object: "payment_intent", status: "succeeded" },
    ...overrides,
  } as Stripe.Checkout.Session;
}

describe("Checkout Session outcome mapping", () => {
  it("treats only a provider-confirmed payment as paid", () => {
    expect(mapCheckoutSessionOutcome(session({}))).toBe("paid");
  });

  it("keeps an open session pending", () => {
    expect(mapCheckoutSessionOutcome(session({ status: "open", payment_status: "unpaid" }))).toBeNull();
  });

  it("reports asynchronous methods as processing until settled", () => {
    expect(
      mapCheckoutSessionOutcome(
        session({
          payment_status: "unpaid",
          payment_intent: {
            id: "pi_1",
            object: "payment_intent",
            status: "processing",
          } as Stripe.PaymentIntent,
        }),
      ),
    ).toBe("processing");
  });

  it("reports a failed asynchronous payment", () => {
    expect(
      mapCheckoutSessionOutcome(
        session({
          payment_status: "unpaid",
          payment_intent: {
            id: "pi_1",
            object: "payment_intent",
            status: "requires_payment_method",
          } as Stripe.PaymentIntent,
        }),
      ),
    ).toBe("failed");
  });

  it("reports an expired Checkout", () => {
    expect(mapCheckoutSessionOutcome(session({ status: "expired", payment_status: "unpaid" }))).toBe(
      "expired",
    );
  });

  it("normalizes provider error codes into the safe database shape", () => {
    expect(safeProviderCode("card_declined", "payment_failed")).toBe("card_declined");
    expect(safeProviderCode("Insufficient-Funds!", "payment_failed")).toBe("insufficient_funds_");
    expect(safeProviderCode(null, "payment_failed")).toBe("payment_failed");
  });
});

describe("service payment synchronization", () => {
  const rpc = vi.fn();
  const admin = { rpc } as never;
  const retrieve = vi.fn();
  const stripe = { checkout: { sessions: { retrieve } } } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockImplementation(async (name: string) =>
      name === "get_service_payment_for_sync"
        ? {
            data: [
              {
                payment_id: "20000000-0000-4000-8000-000000000001",
                service_request_id: "30000000-0000-4000-8000-000000000001",
                household_id: "40000000-0000-4000-8000-000000000001",
                provider_checkout_session_id: "cs_test_synthetic",
                status: "pending",
              },
            ],
            error: null,
          }
        : { data: true, error: null },
    );
  });

  it("re-fetches the session and applies the provider's amount and tax", async () => {
    retrieve.mockResolvedValue(
      session({
        amount_total: 1085,
        total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 86 },
      }),
    );
    const result = await syncServicePaymentFromSession({
      admin,
      stripe,
      sessionId: "cs_test_synthetic",
      providerUpdatedAt: "2026-10-01T12:00:00.000Z",
    });
    expect(retrieve).toHaveBeenCalledWith("cs_test_synthetic", { expand: ["payment_intent"] });
    expect(rpc).toHaveBeenCalledWith(
      "sync_service_payment",
      expect.objectContaining({
        input_outcome: "paid",
        input_amount_total_cents: 1085,
        input_tax_amount_cents: 86,
        input_payment_intent_id: "pi_test_synthetic",
      }),
    );
    expect(result).toMatchObject({
      outcome: "paid",
      changed: true,
      serviceRequestId: "30000000-0000-4000-8000-000000000001",
    });
  });

  it("refuses a session that is not the one recorded for the payment", async () => {
    retrieve.mockResolvedValue(session({ id: "cs_test_other" }));
    await expect(
      syncServicePaymentFromSession({
        admin,
        stripe,
        sessionId: "cs_test_other",
        providerUpdatedAt: "2026-10-01T12:00:00.000Z",
      }),
    ).rejects.toThrow("service_payment_unavailable");
    expect(rpc).not.toHaveBeenCalledWith("sync_service_payment", expect.anything());
  });

  it("ignores subscription Checkout Sessions", async () => {
    retrieve.mockResolvedValue(session({ mode: "subscription" }));
    await expect(
      syncServicePaymentFromSession({
        admin,
        stripe,
        sessionId: "cs_test_synthetic",
        providerUpdatedAt: "2026-10-01T12:00:00.000Z",
      }),
    ).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
