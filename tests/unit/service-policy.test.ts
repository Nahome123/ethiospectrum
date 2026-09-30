import { describe, expect, it } from "vitest";
import { serviceErrorKey } from "@/lib/services/action-state";
import {
  canRescheduleConfirmed,
  formatCents,
  isClosedStatus,
  previewCancellationRefund,
  refundPolicyFor,
} from "@/lib/services/constants";

const now = new Date("2026-10-01T12:00:00Z");
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();

describe("PRD section 26 refund policy (display mirror of the database)", () => {
  it.each([
    [72, "more_than_48_hours", 100],
    [48.5, "more_than_48_hours", 100],
    [48, "between_24_and_48_hours", 50],
    [24, "between_24_and_48_hours", 50],
    [23.9, "less_than_24_hours", 0],
    [1, "less_than_24_hours", 0],
  ])("%s hours before -> %s (%s%%)", (hours, tier, percent) => {
    expect(refundPolicyFor(hours)).toEqual({ tier, percent });
  });

  it("gives a full refund before any appointment is confirmed", () => {
    expect(refundPolicyFor(null)).toEqual({ tier: "no_appointment", percent: 100 });
  });

  it("previews no refund when nothing was paid", () => {
    expect(
      previewCancellationRefund({
        paymentStatus: "unpaid",
        status: "awaiting_payment",
        fullRefundEligible: false,
        refundCapPercent: 100,
        confirmedStartAt: null,
        now,
      }).percent,
    ).toBe(0);
  });

  it("gives 100% after an Ethiospectrum cancellation regardless of timing", () => {
    expect(
      previewCancellationRefund({
        paymentStatus: "paid",
        status: "reschedule_requested",
        fullRefundEligible: true,
        refundCapPercent: 0,
        confirmedStartAt: hoursFromNow(2),
        now,
      }),
    ).toEqual({ tier: "administrative_cancellation", percent: 100 });
  });

  it("gives no automatic refund after a no-show", () => {
    expect(
      previewCancellationRefund({
        paymentStatus: "paid",
        status: "no_show",
        fullRefundEligible: false,
        refundCapPercent: 100,
        confirmedStartAt: null,
        now,
      }),
    ).toEqual({ tier: "no_show", percent: 0 });
  });

  it("caps the refund after a late reschedule", () => {
    expect(
      previewCancellationRefund({
        paymentStatus: "paid",
        status: "appointment_confirmed",
        fullRefundEligible: false,
        refundCapPercent: 50,
        confirmedStartAt: hoursFromNow(100),
        now,
      }).percent,
    ).toBe(50);
  });
});

describe("reschedule rule", () => {
  it("allows unlimited rescheduling more than 48 hours ahead", () => {
    expect(
      canRescheduleConfirmed({ confirmedStartAt: hoursFromNow(49), lateRescheduleUsed: true, now }),
    ).toBe(true);
  });

  it("allows one reschedule within 48 hours", () => {
    expect(
      canRescheduleConfirmed({ confirmedStartAt: hoursFromNow(10), lateRescheduleUsed: false, now }),
    ).toBe(true);
    expect(
      canRescheduleConfirmed({ confirmedStartAt: hoursFromNow(10), lateRescheduleUsed: true, now }),
    ).toBe(false);
  });

  it("does not reschedule an appointment that already started", () => {
    expect(
      canRescheduleConfirmed({ confirmedStartAt: hoursFromNow(-1), lateRescheduleUsed: false, now }),
    ).toBe(false);
  });
});

describe("service display helpers", () => {
  it("formats launch prices in USD for every locale", () => {
    expect(formatCents(999, "en")).toBe("$9.99");
    expect(formatCents(1999, "en")).toBe("$19.99");
    expect(formatCents(1999, "es")).toContain("19.99");
    expect(formatCents(999, "am")).toContain("9.99");
  });

  it("treats completed, cancelled, and declined as closed", () => {
    for (const status of ["completed", "cancelled", "declined"]) expect(isClosedStatus(status)).toBe(true);
    for (const status of ["pending_review", "in_progress", "no_show"])
      expect(isClosedStatus(status)).toBe(false);
  });

  it.each([
    ["42501", "denied"],
    ["40001", "stale"],
    ["55000", "state"],
    ["ES402", "paymentRequired"],
    ["ES409", "conflict"],
    ["ES410", "rescheduleLimit"],
    ["ES422", "feesRequired"],
    ["22007", "timezoneTime"],
    ["23514", "validation"],
    [undefined, "generic"],
  ])("maps database code %s to a localized error", (code, key) => {
    expect(serviceErrorKey(code)).toBe(key);
  });
});
