import "server-only";
import type Stripe from "stripe";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type BillingAdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Returns the household's single Stripe customer, creating and linking it on
 * first use. The link RPC re-verifies that the actor may pay or subscribe.
 */
export async function ensureStripeCustomer({
  admin,
  stripe,
  householdId,
  actorId,
}: {
  admin: BillingAdminClient;
  stripe: Stripe;
  householdId: string;
  actorId: string;
}): Promise<string> {
  const existing = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("household_id", householdId)
    .maybeSingle();
  if (existing.error) throw new Error("billing_customer_load_failed");
  if (existing.data?.stripe_customer_id) return existing.data.stripe_customer_id;

  const customer = await stripe.customers.create(
    { metadata: { ethiospectrum_household_id: householdId } },
    { idempotencyKey: `ethiospectrum-household-${householdId}` },
  );
  const linked = await admin.rpc("link_household_billing_customer", {
    target_household_id: householdId,
    target_actor_id: actorId,
    input_stripe_customer_id: customer.id,
  });
  if (linked.error) throw new Error("billing_customer_link_failed");
  return customer.id;
}
