import "server-only";
import Stripe from "stripe";
import { requireStripeBillingEnv } from "@/lib/env/server";
import type { BillingInterval } from "./constants";

let stripeClient: Stripe | undefined;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireStripeBillingEnv().secretKey, {
      maxNetworkRetries: 2,
    });
  }
  return stripeClient;
}

/** The one-time RBT Boot Camp course Price (a year of access). */
export function getRbtCoursePriceId(): string {
  const priceId = requireStripeBillingEnv().rbtCoursePriceId;
  if (!priceId) throw new Error("rbt_course_price_not_configured");
  return priceId;
}

/** The legacy monthly RBT Price, kept only to recognise grandfathered subscriptions. */
export function getRbtMonthlyPriceId(): string {
  const priceId = requireStripeBillingEnv().rbtMonthlyPriceId;
  if (!priceId) throw new Error("rbt_price_not_configured");
  return priceId;
}

export function getConfiguredBillingInterval(priceId: string): BillingInterval | null {
  const env = requireStripeBillingEnv();
  return env.rbtMonthlyPriceId && priceId === env.rbtMonthlyPriceId ? "month" : null;
}

export function isStripeAutomaticTaxEnabled(): boolean {
  return requireStripeBillingEnv().automaticTax;
}

export function getStripeWebhookSecret(): string {
  return requireStripeBillingEnv().webhookSecret;
}
