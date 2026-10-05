import { describe, expect, it } from "vitest";
import {
  defaultRefundPreset,
  refundAmountForPercent,
  refundPresetOptions,
} from "@/lib/services/refund-presets";

describe("refund presets", () => {
  it("computes each preset from the original payment, rounded to the cent", () => {
    expect(refundAmountForPercent(999, 25)).toBe(250);
    expect(refundAmountForPercent(999, 50)).toBe(500);
    expect(refundAmountForPercent(999, 100)).toBe(999);
  });

  it("disables presets above the refundable limit", () => {
    const options = refundPresetOptions(1999, 1000);
    expect(options.map((option) => [option.percent, option.amountCents, option.available])).toEqual([
      [25, 500, true],
      [50, 1000, true],
      [100, 1999, false],
    ]);
    expect(defaultRefundPreset(options)?.percent).toBe(50);
  });

  it("offers every preset for a fully refundable payment and defaults to 100%", () => {
    const options = refundPresetOptions(999, 999);
    expect(options.every((option) => option.available)).toBe(true);
    expect(defaultRefundPreset(options)?.percent).toBe(100);
  });

  it("has no default when even 25% exceeds what remains", () => {
    expect(defaultRefundPreset(refundPresetOptions(1999, 100))).toBeNull();
  });
});
