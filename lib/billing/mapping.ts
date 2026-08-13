import type Stripe from "stripe";
import {
  mapSubscriptionEntitlement,
  stripeSubscriptionStatusValues,
  type BillingInterval,
  type StripeSubscriptionStatus,
} from "./constants";

const invoiceStatuses = new Set(["draft", "open", "paid", "uncollectible", "void"]);

function timestamp(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

function objectId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export class BillingProviderDataError extends Error {
  constructor(public readonly safeCode: string) {
    super(safeCode);
  }
}

export function isSupportedStripeSubscriptionStatus(status: string): status is StripeSubscriptionStatus {
  return stripeSubscriptionStatusValues.includes(status as StripeSubscriptionStatus);
}

export function mapStripeSubscription(
  subscription: Stripe.Subscription,
  resolveInterval: (priceId: string) => BillingInterval | null,
  providerUpdatedAt: string,
) {
  const item = subscription.items.data[0];
  if (!item || subscription.items.data.length !== 1) {
    throw new BillingProviderDataError("subscription_item_invalid");
  }
  const interval = resolveInterval(item.price.id);
  if (!interval || item.price.currency !== "usd" || item.price.recurring?.interval !== interval) {
    throw new BillingProviderDataError("subscription_price_invalid");
  }
  if (!isSupportedStripeSubscriptionStatus(subscription.status)) {
    throw new BillingProviderDataError("subscription_status_invalid");
  }
  const customerId = objectId(subscription.customer);
  if (!customerId) throw new BillingProviderDataError("subscription_customer_missing");
  const currentPeriodStart = timestamp(item.current_period_start);
  const currentPeriodEnd = timestamp(item.current_period_end);
  if (!currentPeriodStart || !currentPeriodEnd) {
    throw new BillingProviderDataError("subscription_period_invalid");
  }

  return {
    customerId,
    subscriptionId: subscription.id,
    priceId: item.price.id,
    billingInterval: interval,
    stripeStatus: subscription.status,
    entitlementStatus: mapSubscriptionEntitlement(subscription.status),
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelledAt: timestamp(subscription.canceled_at),
    providerUpdatedAt,
  };
}

export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return objectId(invoice.parent?.subscription_details?.subscription ?? null);
}

export function mapStripeInvoice(invoice: Stripe.Invoice) {
  const customerId = objectId(invoice.customer);
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!customerId || !subscriptionId) {
    throw new BillingProviderDataError("invoice_subscription_missing");
  }
  if (!invoice.status || !invoiceStatuses.has(invoice.status) || invoice.currency !== "usd") {
    throw new BillingProviderDataError("invoice_state_invalid");
  }
  const periodStart = timestamp(invoice.period_start);
  const periodEnd = timestamp(invoice.period_end);
  if (!periodStart || !periodEnd) throw new BillingProviderDataError("invoice_period_invalid");
  return {
    customerId,
    subscriptionId,
    invoiceId: invoice.id,
    amountDue: invoice.amount_due,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    status: invoice.status,
    invoiceNumber: invoice.number,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    periodStart,
    periodEnd,
    providerCreatedAt: timestamp(invoice.created) ?? new Date(0).toISOString(),
  };
}
