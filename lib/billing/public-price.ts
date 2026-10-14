import "server-only";
import { unstable_cache } from "next/cache";
import { getStripeBillingEnv } from "@/lib/env/server";
import { formatCents } from "@/lib/services/constants";
import { getStripeClient } from "./provider";

/**
 * The RBT Boot Camp monthly amount, read from the configured Stripe Price so
 * the marketing pages always match what Checkout charges. Cached for an hour;
 * null when Stripe is not configured or unreachable.
 */
export const getRbtMonthlyPriceCents = unstable_cache(
  async (): Promise<number | null> => {
    try {
      const priceId = getStripeBillingEnv()?.rbtMonthlyPriceId;
      if (!priceId) return null;
      const price = await getStripeClient().prices.retrieve(priceId);
      return price.currency === "usd" && typeof price.unit_amount === "number" ? price.unit_amount : null;
    } catch {
      return null;
    }
  },
  ["rbt-monthly-price"],
  { revalidate: 3600 },
);

/** "$14.99/month", or the plain "Monthly" label when the amount is unavailable. */
export async function getRbtMonthlyPriceLabel(
  locale: string,
  t: (key: string, values?: Record<string, string>) => string,
): Promise<string> {
  const cents = await getRbtMonthlyPriceCents();
  return cents === null ? t("rbt.price") : t("rbt.pricePerMonth", { price: formatCents(cents, locale) });
}
