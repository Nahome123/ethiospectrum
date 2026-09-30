/** Mirrors the database allowlists. The database remains authoritative. */

export const requestableServiceTypes = ["consultation", "iep_language_assistance"] as const;
export const serviceTypeValues = ["rbt_bootcamp", ...requestableServiceTypes] as const;
export type RequestableServiceType = (typeof requestableServiceTypes)[number];
export type ServiceType = (typeof serviceTypeValues)[number];

export const serviceStatusValues = [
  "pending_review",
  "assigned",
  "awaiting_availability",
  "awaiting_payment",
  "appointment_proposed",
  "appointment_confirmed",
  "in_progress",
  "completed",
  "payment_failed",
  "cancelled",
  "reschedule_requested",
  "declined",
  "no_show",
] as const;
export type ServiceStatus = (typeof serviceStatusValues)[number];

/** The primary lifecycle from PRD section 23, in display order. */
export const serviceLifecycle: readonly ServiceStatus[] = [
  "pending_review",
  "assigned",
  "awaiting_availability",
  "awaiting_payment",
  "appointment_proposed",
  "appointment_confirmed",
  "in_progress",
  "completed",
];

export const closedServiceStatuses: readonly ServiceStatus[] = ["completed", "cancelled", "declined"];

export const paymentStatusValues = [
  "unpaid",
  "pending",
  "processing",
  "paid",
  "failed",
  "partially_refunded",
  "refunded",
] as const;
export type PaymentStatus = (typeof paymentStatusValues)[number];

export const appointmentStatusValues = [
  "proposed",
  "confirmed",
  "declined",
  "superseded",
  "cancelled",
  "completed",
  "no_show",
] as const;
export type AppointmentStatus = (typeof appointmentStatusValues)[number];

export const followUpStatusValues = [
  "not_available",
  "available",
  "requested",
  "scheduled",
  "completed",
  "waived",
] as const;
export type FollowUpStatus = (typeof followUpStatusValues)[number];

export const consultationCategoryValues = ["general_guidance", "behavioral_educational"] as const;
export type ConsultationCategory = (typeof consultationCategoryValues)[number];

export const sessionLanguageValues = ["en", "am", "es"] as const;
export type SessionLanguage = (typeof sessionLanguageValues)[number];

/** IEP Language Assistance is English <-> one of these languages. */
export const iepLanguageValues = ["am", "es"] as const;
export type IepLanguage = (typeof iepLanguageValues)[number];

export const iepServiceValues = [
  "iep_explanation",
  "meeting_language_assistance",
  "written_translation",
] as const;
export type IepService = (typeof iepServiceValues)[number];

export const deliveryMethodValues = ["remote", "in_person"] as const;
export type DeliveryMethod = (typeof deliveryMethodValues)[number];

export const inPersonLocationValues = [
  "ethiospectrum_location",
  "school_meeting",
  "mutually_agreed",
] as const;
export type InPersonLocation = (typeof inPersonLocationValues)[number];
export const locationTypeValues = ["remote", ...inPersonLocationValues] as const;
export type LocationType = (typeof locationTypeValues)[number];

export const activityStatusValues = ["pending", "in_progress", "completed", "not_needed"] as const;
export type ActivityStatus = (typeof activityStatusValues)[number];

export const adminQueueValues = [
  "new",
  "unassigned",
  "assigned",
  "awaiting_payment",
  "payment_failed",
  "proposed",
  "upcoming",
  "in_progress",
  "follow_up",
  "reschedule",
  "cancelled",
  "no_show",
  "completed",
  "refunds",
] as const;
export type AdminQueue = (typeof adminQueueValues)[number] | "all" | "declined";

export const overridableStatusValues = [
  "pending_review",
  "assigned",
  "awaiting_availability",
  "awaiting_payment",
  "appointment_proposed",
  "appointment_confirmed",
  "in_progress",
  "reschedule_requested",
  "no_show",
] as const;

export const refundPolicyTierValues = [
  "more_than_48_hours",
  "between_24_and_48_hours",
  "less_than_24_hours",
  "no_show",
  "no_appointment",
  "administrative_cancellation",
  "admin_exception",
  "duplicate_payment",
] as const;
export type RefundPolicyTier = (typeof refundPolicyTierValues)[number];

export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 3000;
export const RELEVANT_INFORMATION_MAX = 3000;
export const LOCATION_DETAILS_MAX = 500;
export const INSTRUCTIONS_MAX = 1000;
export const MESSAGE_MAX = 2000;
export const NOTES_MAX = 3000;
export const REASON_MAX = 1000;
export const MAX_PROPOSED_SLOTS = 3;

/**
 * Display mirror of `public.service_refund_policy` (PRD section 26). The
 * database computes the refund that is actually requested.
 */
export function refundPolicyFor(hoursBeforeStart: number | null): {
  tier: RefundPolicyTier;
  percent: number;
} {
  if (hoursBeforeStart === null) return { tier: "no_appointment", percent: 100 };
  if (hoursBeforeStart > 48) return { tier: "more_than_48_hours", percent: 100 };
  if (hoursBeforeStart >= 24) return { tier: "between_24_and_48_hours", percent: 50 };
  return { tier: "less_than_24_hours", percent: 0 };
}

/**
 * Mirrors the database cancellation preview so the confirmation dialog can
 * state the expected refund before the customer commits.
 */
export function previewCancellationRefund(input: {
  paymentStatus: PaymentStatus;
  status: ServiceStatus;
  fullRefundEligible: boolean;
  refundCapPercent: number;
  confirmedStartAt: string | null;
  now?: Date;
}): { tier: RefundPolicyTier; percent: number } {
  if (input.paymentStatus !== "paid" && input.paymentStatus !== "partially_refunded") {
    return { tier: "no_appointment", percent: 0 };
  }
  if (input.fullRefundEligible) return { tier: "administrative_cancellation", percent: 100 };
  if (input.status === "no_show") return { tier: "no_show", percent: 0 };
  const now = input.now ?? new Date();
  const hours = input.confirmedStartAt
    ? (new Date(input.confirmedStartAt).getTime() - now.getTime()) / 3_600_000
    : null;
  const policy = refundPolicyFor(hours);
  return { tier: policy.tier, percent: Math.min(policy.percent, input.refundCapPercent) };
}

/** Mirrors the reschedule rule: free beyond 48 hours; once within 48 hours. */
export function canRescheduleConfirmed(input: {
  confirmedStartAt: string;
  lateRescheduleUsed: boolean;
  now?: Date;
}): boolean {
  const hours =
    (new Date(input.confirmedStartAt).getTime() - (input.now ?? new Date()).getTime()) / 3_600_000;
  if (hours <= 0) return false;
  return hours > 48 || !input.lateRescheduleUsed;
}

export function formatCents(cents: number | null | undefined, locale: string): string {
  const intlLocale = locale === "am" ? "am-ET" : locale === "es" ? "es-US" : "en-US";
  return new Intl.NumberFormat(intlLocale, { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);
}

export function isClosedStatus(status: string): boolean {
  return (closedServiceStatuses as readonly string[]).includes(status);
}
