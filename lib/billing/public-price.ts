import "server-only";
import { formatCents } from "@/lib/services/constants";
import { RBT_COURSE_PRICE_CENTS } from "./constants";

/** The RBT Boot Camp course amount; fixed in code, and what Checkout charges. */
export async function getRbtCoursePriceCents(): Promise<number> {
  return RBT_COURSE_PRICE_CENTS;
}

/** "$99.00 one-time · 1 year of access". */
export async function getRbtCoursePriceLabel(
  locale: string,
  t: (key: string, values?: Record<string, string>) => string,
): Promise<string> {
  return t("rbt.priceOneTime", { price: formatCents(RBT_COURSE_PRICE_CENTS, locale) });
}
