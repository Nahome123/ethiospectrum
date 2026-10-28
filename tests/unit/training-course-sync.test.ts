import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reconcileTrainingCourse,
  syncTrainingCourseFromSession,
  syncTrainingCourseRefund,
} from "@/lib/billing/course";

const household = "d2000000-0000-4000-8000-000000000001";
const actor = "d1000000-0000-4000-8000-000000000001";
const courseMetadata = {
  ethiospectrum_training_course: "rbt_bootcamp",
  ethiospectrum_household_id: household,
  ethiospectrum_actor_id: actor,
};

function session(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: "cs_course1",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_course1",
    amount_total: 9900,
    currency: "usd",
    created: 1_790_000_000,
    metadata: courseMetadata,
    ...overrides,
  } as Stripe.Checkout.Session;
}

describe("RBT Boot Camp course sync", () => {
  const rpc = vi.fn();
  const admin = { rpc } as never;
  const retrieveSession = vi.fn();
  const retrieveIntent = vi.fn();
  const listSessions = vi.fn();
  const stripe = {
    checkout: { sessions: { retrieve: retrieveSession, list: listSessions } },
    paymentIntents: { retrieve: retrieveIntent },
  } as unknown as Stripe;

  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: true, error: null });
  });

  it("grants a year of access for a paid course Checkout", async () => {
    retrieveSession.mockResolvedValue(session());
    await expect(
      syncTrainingCourseFromSession({
        admin,
        stripe,
        sessionId: "cs_course1",
        providerUpdatedAt: "2026-10-27T00:00:00Z",
      }),
    ).resolves.toBe(household);
    expect(rpc).toHaveBeenCalledWith("grant_training_access", {
      target_household_id: household,
      input_session_id: "cs_course1",
      input_payment_intent_id: "pi_course1",
      input_amount_cents: 9900,
      input_currency: "usd",
      input_paid_at: new Date(1_790_000_000 * 1000).toISOString(),
      input_purchased_by: actor,
      input_provider_updated_at: "2026-10-27T00:00:00Z",
    });
  });

  it("waits for a payment that is still processing, and ignores service Checkouts", async () => {
    retrieveSession.mockResolvedValue(session({ payment_status: "unpaid" }));
    await syncTrainingCourseFromSession({ admin, stripe, sessionId: "cs_course1", providerUpdatedAt: "x" });
    retrieveSession.mockResolvedValue(session({ metadata: { ethiospectrum_payment_id: "p1" } }));
    await expect(
      syncTrainingCourseFromSession({ admin, stripe, sessionId: "cs_service", providerUpdatedAt: "x" }),
    ).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("revokes access when a course charge is fully refunded", async () => {
    rpc.mockResolvedValue({ data: household, error: null });
    retrieveIntent.mockResolvedValue({ id: "pi_course1", metadata: courseMetadata });
    const charge = { refunded: true, payment_intent: "pi_course1" } as Stripe.Charge;
    await expect(syncTrainingCourseRefund({ admin, stripe, charge, providerUpdatedAt: "t" })).resolves.toBe(
      household,
    );
    expect(rpc).toHaveBeenCalledWith("revoke_training_access", {
      input_payment_intent_id: "pi_course1",
      input_provider_updated_at: "t",
      target_household_id: household,
    });
  });

  it("ignores partial refunds and charges for other payments", async () => {
    await syncTrainingCourseRefund({
      admin,
      stripe,
      charge: { refunded: false, payment_intent: "pi_course1" } as Stripe.Charge,
      providerUpdatedAt: "t",
    });
    retrieveIntent.mockResolvedValue({ id: "pi_service", metadata: { ethiospectrum_payment_id: "p1" } });
    await syncTrainingCourseRefund({
      admin,
      stripe,
      charge: { refunded: true, payment_intent: "pi_service" } as Stripe.Charge,
      providerUpdatedAt: "t",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reconciliation re-applies paid course purchases and their refunds", async () => {
    listSessions.mockResolvedValue({
      data: [session(), session({ id: "cs_other", metadata: { ethiospectrum_payment_id: "p1" } })],
    });
    retrieveSession.mockResolvedValue(session());
    retrieveIntent.mockResolvedValue({
      id: "pi_course1",
      metadata: courseMetadata,
      latest_charge: { refunded: true, payment_intent: "pi_course1" },
    });
    await reconcileTrainingCourse({ admin, stripe, customerId: "cus_1" });
    expect(listSessions).toHaveBeenCalledWith({ customer: "cus_1", limit: 50 });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["grant_training_access", "revoke_training_access"]);
  });
});
