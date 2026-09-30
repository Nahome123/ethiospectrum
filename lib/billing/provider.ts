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

/** The only subscription Price: RBT Boot Camp, billed monthly. */
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
