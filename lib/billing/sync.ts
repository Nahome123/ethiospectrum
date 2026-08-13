import "server-only";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getConfiguredBillingInterval } from "./provider";
import { mapStripeInvoice, mapStripeSubscription } from "./mapping";

type BillingAdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function findHouseholdId(admin: BillingAdminClient, customerId: string): Promise<string> {
  const { data, error } = await admin
    .from("billing_customers")
    .select("household_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error || !data) throw new Error("billing_customer_unavailable");
  return data.household_id;
}

export async function syncStripeSubscription({
  admin,
  stripe,
  subscriptionId,
  providerUpdatedAt,
}: {
  admin: BillingAdminClient;
  stripe: Stripe;
  subscriptionId: string;
  providerUpdatedAt: string;
}): Promise<string> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const mapped = mapStripeSubscription(subscription, getConfiguredBillingInterval, providerUpdatedAt);
  const householdId = await findHouseholdId(admin, mapped.customerId);
  const { error } = await admin.rpc("sync_billing_subscription", {
    target_household_id: householdId,
    input_stripe_customer_id: mapped.customerId,
    input_stripe_subscription_id: mapped.subscriptionId,
    input_stripe_price_id: mapped.priceId,
    input_billing_interval: mapped.billingInterval,
    input_stripe_status: mapped.stripeStatus,
    input_current_period_start: mapped.currentPeriodStart,
    input_current_period_end: mapped.currentPeriodEnd,
    input_cancel_at_period_end: mapped.cancelAtPeriodEnd,
    input_provider_updated_at: mapped.providerUpdatedAt,
    input_cancelled_at: mapped.cancelledAt ?? undefined,
  });
  if (error) throw new Error("subscription_sync_failed");
  return householdId;
}

export async function syncStripeInvoice({
  admin,
  stripe,
  invoiceId,
  providerUpdatedAt,
}: {
  admin: BillingAdminClient;
  stripe: Stripe;
  invoiceId: string;
  providerUpdatedAt: string;
}): Promise<string> {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const mapped = mapStripeInvoice(invoice);
  const householdId = await findHouseholdId(admin, mapped.customerId);
  await syncStripeSubscription({
    admin,
    stripe,
    subscriptionId: mapped.subscriptionId,
    providerUpdatedAt,
  });
  const { error } = await admin.rpc("sync_billing_invoice", {
    target_household_id: householdId,
    input_stripe_invoice_id: mapped.invoiceId,
    input_stripe_subscription_id: mapped.subscriptionId,
    input_amount_due: mapped.amountDue,
    input_amount_paid: mapped.amountPaid,
    input_currency: mapped.currency,
    input_status: mapped.status,
    input_period_start: mapped.periodStart,
    input_period_end: mapped.periodEnd,
    input_provider_created_at: mapped.providerCreatedAt,
    input_provider_updated_at: providerUpdatedAt,
    input_invoice_number: mapped.invoiceNumber ?? undefined,
    input_hosted_invoice_url: mapped.hostedInvoiceUrl ?? undefined,
  });
  if (error) throw new Error("invoice_sync_failed");
  return householdId;
}

export async function reconcileBillingHousehold({
  admin,
  stripe,
  householdId,
  actorId,
}: {
  admin: BillingAdminClient;
  stripe: Stripe;
  householdId: string;
  actorId: string;
}): Promise<void> {
  const customerResult = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("household_id", householdId)
    .maybeSingle();
  if (customerResult.error || !customerResult.data) throw new Error("billing_customer_unavailable");

  const subscriptions = await stripe.subscriptions.list({
    customer: customerResult.data.stripe_customer_id,
    status: "all",
    limit: 20,
  });
  const supported = subscriptions.data
    .filter((subscription) => {
      const priceId = subscription.items.data[0]?.price.id;
      return Boolean(priceId && getConfiguredBillingInterval(priceId));
    })
    .sort((left, right) => right.created - left.created);
  if (supported.length > 0) {
    await syncStripeSubscription({
      admin,
      stripe,
      subscriptionId: supported[0].id,
      providerUpdatedAt: new Date().toISOString(),
    });
  }

  const invoices = await stripe.invoices.list({
    customer: customerResult.data.stripe_customer_id,
    limit: 25,
  });
  for (const invoice of invoices.data) {
    if (!invoice.parent?.subscription_details?.subscription) continue;
    await syncStripeInvoice({
      admin,
      stripe,
      invoiceId: invoice.id,
      providerUpdatedAt: new Date().toISOString(),
    });
  }
  const { error } = await admin.rpc("record_billing_reconciliation", {
    target_household_id: householdId,
    target_actor_id: actorId,
  });
  if (error) throw new Error("billing_reconciliation_failed");
}
