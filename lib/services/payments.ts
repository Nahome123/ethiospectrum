import "server-only";
import type Stripe from "stripe";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type CheckoutOutcome = "paid" | "processing" | "failed" | "expired";

export const PAYMENT_METADATA_KEY = "ethiospectrum_payment_id";
export const REQUEST_METADATA_KEY = "ethiospectrum_service_request_id";
export const REFUND_METADATA_KEY = "ethiospectrum_refund_id";

/** Converts a provider error code into the database's safe code shape. */
export function safeProviderCode(code: string | null | undefined, fallback: string): string {
  const normalized = (code ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 80);
  return /^[a-z0-9_]{1,80}$/.test(normalized) ? normalized : fallback;
}

function paymentIntentOf(session: Stripe.Checkout.Session): Stripe.PaymentIntent | null {
  return session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
}

/**
 * Maps an authoritative, freshly retrieved Checkout Session to a payment
 * outcome. Null means the customer has not finished Checkout yet.
 */
export function mapCheckoutSessionOutcome(session: Stripe.Checkout.Session): CheckoutOutcome | null {
  if (session.status === "expired") return "expired";
  if (session.payment_status === "paid" || session.payment_status === "no_payment_required") return "paid";
  if (session.status !== "complete") return null;
  const intent = paymentIntentOf(session);
  if (intent && (intent.status === "requires_payment_method" || intent.status === "canceled"))
    return "failed";
  return "processing";
}

export type ServicePaymentSync = {
  paymentId: string;
  serviceRequestId: string;
  householdId: string;
  outcome: CheckoutOutcome | null;
  changed: boolean;
};

/** Re-fetches the session from Stripe and applies it through the service-role RPC. */
export async function syncServicePaymentFromSession({
  admin,
  stripe,
  sessionId,
  providerUpdatedAt,
  failureCode,
}: {
  admin: AdminClient;
  stripe: Stripe;
  sessionId: string;
  providerUpdatedAt: string;
  failureCode?: string;
}): Promise<ServicePaymentSync | null> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
  if (session.mode !== "payment") return null;
  const paymentId = session.metadata?.[PAYMENT_METADATA_KEY];
  if (!paymentId) return null;

  const stored = await admin.rpc("get_service_payment_for_sync", { target_payment_id: paymentId });
  const row = stored.data?.[0];
  if (stored.error || !row || row.provider_checkout_session_id !== session.id) {
    throw new Error("service_payment_unavailable");
  }
  const outcome = failureCode ? "failed" : mapCheckoutSessionOutcome(session);
  if (!outcome) {
    return {
      paymentId,
      serviceRequestId: row.service_request_id,
      householdId: row.household_id,
      outcome,
      changed: false,
    };
  }
  const intent = paymentIntentOf(session);
  const { data, error } = await admin.rpc("sync_service_payment", {
    target_payment_id: paymentId,
    input_session_id: session.id,
    input_payment_intent_id:
      intent?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : undefined),
    input_outcome: outcome,
    input_amount_total_cents: session.amount_total ?? undefined,
    input_tax_amount_cents: session.total_details?.amount_tax ?? undefined,
    input_failure_code:
      outcome === "failed"
        ? safeProviderCode(failureCode ?? intent?.last_payment_error?.code, "payment_failed")
        : undefined,
    input_provider_updated_at: providerUpdatedAt,
  });
  if (error) throw new Error("service_payment_sync_failed");
  return {
    paymentId,
    serviceRequestId: row.service_request_id,
    householdId: row.household_id,
    outcome,
    changed: data === true,
  };
}

/** A declined card inside an open Checkout Session is reported through its PaymentIntent. */
export async function syncServicePaymentFailure({
  admin,
  stripe,
  paymentIntent,
  providerUpdatedAt,
}: {
  admin: AdminClient;
  stripe: Stripe;
  paymentIntent: Stripe.PaymentIntent;
  providerUpdatedAt: string;
}): Promise<string | undefined> {
  const paymentId = paymentIntent.metadata?.[PAYMENT_METADATA_KEY];
  if (!paymentId) return undefined;
  const stored = await admin.rpc("get_service_payment_for_sync", { target_payment_id: paymentId });
  const row = stored.data?.[0];
  if (stored.error || !row?.provider_checkout_session_id) throw new Error("service_payment_unavailable");
  await syncServicePaymentFromSession({
    admin,
    stripe,
    sessionId: row.provider_checkout_session_id,
    providerUpdatedAt,
    failureCode: safeProviderCode(paymentIntent.last_payment_error?.code, "payment_failed"),
  });
  return row.household_id;
}

/** Applies a provider refund result to a refund the administrator started. */
export async function syncServiceRefund({
  admin,
  refund,
}: {
  admin: AdminClient;
  refund: Stripe.Refund;
}): Promise<void> {
  const refundId = refund.metadata?.[REFUND_METADATA_KEY];
  if (
    !refundId ||
    (refund.status !== "succeeded" && refund.status !== "failed" && refund.status !== "canceled")
  )
    return;
  const { error } = await admin.rpc("complete_service_refund", {
    target_refund_id: refundId,
    input_provider_refund_id: refund.id,
    input_outcome: refund.status === "succeeded" ? "succeeded" : "failed",
    input_failure_code:
      refund.status === "succeeded" ? undefined : safeProviderCode(refund.failure_reason, "refund_failed"),
  });
  // A refund already completed synchronously is no longer `processing`; that is not a failure.
  if (error && error.code !== "55000") throw new Error("service_refund_sync_failed");
}
