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

export function getStripePriceId(interval: BillingInterval): string {
  const env = requireStripeBillingEnv();
  return interval === "month" ? env.familyPlusMonthlyPriceId : env.familyPlusAnnualPriceId;
}

export function getConfiguredBillingInterval(priceId: string): BillingInterval | null {
  const env = requireStripeBillingEnv();
  if (priceId === env.familyPlusMonthlyPriceId) return "month";
  if (priceId === env.familyPlusAnnualPriceId) return "year";
  return null;
}

export function getStripeWebhookSecret(): string {
  return requireStripeBillingEnv().webhookSecret;
}
