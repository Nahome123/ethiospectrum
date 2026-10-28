import "server-only";
import { unstable_cache } from "next/cache";
import { getStripeBillingEnv } from "@/lib/env/server";
import { formatCents } from "@/lib/services/constants";
import { getStripeClient } from "./provider";

/**
 * The RBT Boot Camp course amount, read from the configured one-time Stripe
 * Price so the marketing pages always match what Checkout charges. Cached for
 * an hour; null when Stripe is not configured or unreachable.
 */
export const getRbtCoursePriceCents = unstable_cache(
  async (): Promise<number | null> => {
    try {
      const priceId = getStripeBillingEnv()?.rbtCoursePriceId;
      if (!priceId) return null;
      const price = await getStripeClient().prices.retrieve(priceId);
      return price.currency === "usd" && typeof price.unit_amount === "number" ? price.unit_amount : null;
    } catch {
      return null;
    }
  },
  ["rbt-course-price"],
  { revalidate: 3600 },
);

/** "$99 one-time · 1 year of access", or the plain course label when the amount is unavailable. */
export async function getRbtCoursePriceLabel(
  locale: string,
  t: (key: string, values?: Record<string, string>) => string,
): Promise<string> {
  const cents = await getRbtCoursePriceCents();
  return cents === null ? t("rbt.price") : t("rbt.priceOneTime", { price: formatCents(cents, locale) });
}
