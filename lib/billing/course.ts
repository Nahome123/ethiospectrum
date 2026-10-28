import "server-only";
import type Stripe from "stripe";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** Marks a Checkout Session / PaymentIntent as an RBT Boot Camp course purchase. */
export const TRAINING_COURSE_METADATA_KEY = "ethiospectrum_training_course";
const HOUSEHOLD_METADATA_KEY = "ethiospectrum_household_id";
const ACTOR_METADATA_KEY = "ethiospectrum_actor_id";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCourseCheckout(session: Pick<Stripe.Checkout.Session, "metadata">): boolean {
  return session.metadata?.[TRAINING_COURSE_METADATA_KEY] === "rbt_bootcamp";
}

function paymentIntentId(value: string | Stripe.PaymentIntent | null): string | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id;
}

/**
 * Grants a year of access for a paid course Checkout. Unpaid (still
 * processing) sessions are left alone; a later event completes them.
 * Returns the household, or null when the session is not a course purchase.
 */
export async function syncTrainingCourseFromSession({
  admin,
  stripe,
  sessionId,
  providerUpdatedAt,
}: {
  admin: AdminClient;
  stripe: Stripe;
  sessionId: string;
  providerUpdatedAt: string;
}): Promise<string | null> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.mode !== "payment" || !isCourseCheckout(session)) return null;
  const householdId = session.metadata?.[HOUSEHOLD_METADATA_KEY] ?? "";
  if (!uuid.test(householdId)) throw new Error("course_household_missing");
  if (session.payment_status !== "paid") return householdId;
  const intentId = paymentIntentId(session.payment_intent);
  if (!intentId) throw new Error("course_payment_intent_missing");
  const actor = session.metadata?.[ACTOR_METADATA_KEY];
  const { error } = await admin.rpc("grant_training_access", {
    target_household_id: householdId,
    input_session_id: session.id,
    input_payment_intent_id: intentId,
    input_amount_cents: session.amount_total ?? 0,
    input_currency: session.currency ?? "usd",
    input_paid_at: new Date(session.created * 1000).toISOString(),
    input_purchased_by: actor && uuid.test(actor) ? actor : undefined,
    input_provider_updated_at: providerUpdatedAt,
  });
  if (error) throw new Error("course_grant_failed");
  return householdId;
}

/** A fully refunded course charge ends that purchase's access. Other charges are ignored. */
export async function syncTrainingCourseRefund({
  admin,
  stripe,
  charge,
  providerUpdatedAt,
}: {
  admin: AdminClient;
  stripe: Stripe;
  charge: Stripe.Charge;
  providerUpdatedAt: string;
}): Promise<string | null> {
  const intentId = paymentIntentId(charge.payment_intent as string | Stripe.PaymentIntent | null);
  if (!charge.refunded || !intentId) return null;
  const intent = await stripe.paymentIntents.retrieve(intentId);
  const isCourse = intent.metadata?.[TRAINING_COURSE_METADATA_KEY] === "rbt_bootcamp";
  const household = intent.metadata?.[HOUSEHOLD_METADATA_KEY];
  if (!isCourse) return null;
  const { data, error } = await admin.rpc("revoke_training_access", {
    input_payment_intent_id: intentId,
    input_provider_updated_at: providerUpdatedAt,
    target_household_id: household && uuid.test(household) ? household : undefined,
  });
  if (error) throw new Error("course_revoke_failed");
  return data ?? null;
}

/** Reconciliation: re-applies every paid course Checkout and full refund for a customer. */
export async function reconcileTrainingCourse({
  admin,
  stripe,
  customerId,
}: {
  admin: AdminClient;
  stripe: Stripe;
  customerId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 50 });
  for (const session of sessions.data) {
    if (session.mode !== "payment" || !isCourseCheckout(session) || session.payment_status !== "paid")
      continue;
    await syncTrainingCourseFromSession({ admin, stripe, sessionId: session.id, providerUpdatedAt: now });
    const intentId = paymentIntentId(session.payment_intent);
    if (!intentId) continue;
    const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
    const charge = intent.latest_charge;
    if (charge && typeof charge !== "string" && charge.refunded) {
      await syncTrainingCourseRefund({ admin, stripe, charge, providerUpdatedAt: now });
    }
  }
}
