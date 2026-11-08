import { describe, expect, it } from "vitest";

import { getRbtCoursePriceCents, getRbtCoursePriceLabel } from "@/lib/billing/public-price";

const t = (key: string, values?: Record<string, string>) =>
  key === "rbt.priceOneTime" ? `${values?.price} one-time · 1 year of access` : "One-time course";

describe("RBT Boot Camp public price", () => {
  it("is fixed at $99 with no Stripe lookup", async () => {
    await expect(getRbtCoursePriceCents()).resolves.toBe(9900);
    await expect(getRbtCoursePriceLabel("en", t)).resolves.toBe("$99.00 one-time · 1 year of access");
  });
});
