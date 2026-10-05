export const refundPresetPercents = [25, 50, 100] as const;
export type RefundPresetPercent = (typeof refundPresetPercents)[number];

export type RefundPresetOption = {
  percent: RefundPresetPercent;
  amountCents: number;
  /** False when the amount exceeds what may still be refunded. */
  available: boolean;
};

/** Percent of the original payment, rounded to the nearest cent. */
export function refundAmountForPercent(originalCents: number, percent: number): number {
  return Math.round((originalCents * percent) / 100);
}

/**
 * The preset refund options for a payment. `maxCents` is the most that may be
 * refunded (the policy-eligible amount, less anything already refunded); the
 * database enforces the same limit.
 */
export function refundPresetOptions(originalCents: number, maxCents: number): RefundPresetOption[] {
  return refundPresetPercents.map((percent) => {
    const amountCents = refundAmountForPercent(originalCents, percent);
    return { percent, amountCents, available: amountCents > 0 && amountCents <= maxCents };
  });
}

/** The largest available preset, or null when none fits the limit. */
export function defaultRefundPreset(options: RefundPresetOption[]): RefundPresetOption | null {
  return [...options].reverse().find((option) => option.available) ?? null;
}
