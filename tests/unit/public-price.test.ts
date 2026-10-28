import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ env: vi.fn(), retrieve: vi.fn() }));

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/env/server", () => ({ getStripeBillingEnv: mocks.env }));
vi.mock("@/lib/billing/provider", () => ({
  getStripeClient: () => ({ prices: { retrieve: mocks.retrieve } }),
}));

import { getRbtCoursePriceLabel } from "@/lib/billing/public-price";

const t = (key: string, values?: Record<string, string>) =>
  key === "rbt.priceOneTime" ? `${values?.price} one-time · 1 year of access` : "One-time course";

describe("RBT Boot Camp public price", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the configured one-time Stripe amount", async () => {
    mocks.env.mockReturnValue({ rbtCoursePriceId: "price_course1" });
    mocks.retrieve.mockResolvedValue({ currency: "usd", unit_amount: 9900 });
    await expect(getRbtCoursePriceLabel("en", t)).resolves.toBe("$99.00 one-time · 1 year of access");
    expect(mocks.retrieve).toHaveBeenCalledWith("price_course1");
  });

  it("falls back to the plain label without Stripe", async () => {
    mocks.env.mockReturnValue(undefined);
    await expect(getRbtCoursePriceLabel("en", t)).resolves.toBe("One-time course");
  });

  it("falls back to the plain label when Stripe fails", async () => {
    mocks.env.mockReturnValue({ rbtCoursePriceId: "price_course1" });
    mocks.retrieve.mockRejectedValue(new Error("network"));
    await expect(getRbtCoursePriceLabel("en", t)).resolves.toBe("One-time course");
  });
});
