import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ env: vi.fn(), retrieve: vi.fn() }));

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/env/server", () => ({ getStripeBillingEnv: mocks.env }));
vi.mock("@/lib/billing/provider", () => ({
  getStripeClient: () => ({ prices: { retrieve: mocks.retrieve } }),
}));

import { getRbtMonthlyPriceLabel } from "@/lib/billing/public-price";

const t = (key: string, values?: Record<string, string>) =>
  key === "rbt.pricePerMonth" ? `${values?.price}/month` : "Monthly";

describe("RBT Boot Camp public price", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the configured Stripe amount per month", async () => {
    mocks.env.mockReturnValue({ rbtMonthlyPriceId: "price_monthly1" });
    mocks.retrieve.mockResolvedValue({ currency: "usd", unit_amount: 1499 });
    await expect(getRbtMonthlyPriceLabel("en", t)).resolves.toBe("$14.99/month");
    expect(mocks.retrieve).toHaveBeenCalledWith("price_monthly1");
  });

  it("falls back to the plain label without Stripe", async () => {
    mocks.env.mockReturnValue(undefined);
    await expect(getRbtMonthlyPriceLabel("en", t)).resolves.toBe("Monthly");
  });

  it("falls back to the plain label when Stripe fails", async () => {
    mocks.env.mockReturnValue({ rbtMonthlyPriceId: "price_monthly1" });
    mocks.retrieve.mockRejectedValue(new Error("network"));
    await expect(getRbtMonthlyPriceLabel("en", t)).resolves.toBe("Monthly");
  });
});
