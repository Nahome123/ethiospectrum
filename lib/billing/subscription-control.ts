import "server-only";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncStripeSubscription } from "./sync";

type BillingAdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** Stripe statuses that still bill or grant access; anything else has already ended. */
const LIVE_STATUSES = ["trialing", "active", "past_due", "unpaid", "paused", "incomplete"];

export type HouseholdSubscription = {
  subscriptionId: string;
  stripeStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

/** The household's subscription that is still live in Stripe, if any. */
export async function findLiveHouseholdSubscription(
  admin: BillingAdminClient,
  householdId: string,
): Promise<HouseholdSubscription | null> {
  const { data, error } = await admin
    .from("billing_subscriptions")
    .select("stripe_subscription_id, stripe_status, cancel_at_period_end, current_period_end")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw new Error("subscription_lookup_failed");
  if (!data || !LIVE_STATUSES.includes(data.stripe_status)) return null;
  return {
    subscriptionId: data.stripe_subscription_id,
    stripeStatus: data.stripe_status,
    cancelAtPeriodEnd: data.cancel_at_period_end,
    currentPeriodEnd: data.current_period_end,
  };
}

/**
 * Schedules (or withdraws) cancellation at the end of the paid period, then
 * syncs the result so the page reflects it before the webhook arrives.
 */
export async function setCancelAtPeriodEnd({
  admin,
  stripe,
  subscriptionId,
  cancel,
}: {
  admin: BillingAdminClient;
  stripe: Stripe;
  subscriptionId: string;
  cancel: boolean;
}): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: cancel });
  await syncStripeSubscription({
    admin,
    stripe,
    subscriptionId,
    providerUpdatedAt: new Date().toISOString(),
  });
}

/** Ends the subscription now. No refund or proration is issued. */
export async function cancelSubscriptionNow({
  admin,
  stripe,
  subscriptionId,
}: {
  admin: BillingAdminClient;
  stripe: Stripe;
  subscriptionId: string;
}): Promise<void> {
  const current = await stripe.subscriptions.retrieve(subscriptionId);
  if (current.status !== "canceled" && current.status !== "incomplete_expired") {
    await stripe.subscriptions.cancel(subscriptionId, { prorate: false, invoice_now: false });
  }
  await syncStripeSubscription({
    admin,
    stripe,
    subscriptionId,
    providerUpdatedAt: new Date().toISOString(),
  });
}
