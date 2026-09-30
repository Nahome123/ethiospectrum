/**
 * Notification rendering shared by the in-app list and email delivery. Stored
 * payloads carry only safe, small values; every visible string comes from the
 * recipient's locale messages under `notifications.types.<type>`.
 */

export const notificationTypeValues = [
  "account_created",
  "caregiver_invitation",
  "caregiver_joined",
  "caregiver_removed",
  "subscription_activated",
  "subscription_inactive",
  "request_received",
  "specialist_assigned",
  "appointment_proposed",
  "appointment_confirmed",
  "appointment_reminder",
  "appointment_cancelled",
  "appointment_rescheduled",
  "payment_confirmed",
  "payment_failed",
  "refund_processed",
  "service_completed",
  "follow_up_available",
  "request_declined",
  "document_available",
  "new_message",
  "specialist_new_assignment",
  "specialist_availability_requested",
  "specialist_appointment_proposed",
  "specialist_appointment_confirmed",
  "specialist_appointment_rescheduled",
  "specialist_appointment_cancelled",
  "specialist_appointment_reminder",
  "specialist_document_available",
  "specialist_follow_up_required",
  "specialist_new_message",
  "specialist_service_completed",
  "admin_new_request",
  "admin_payment_failed",
  "admin_cancellation",
  "admin_reschedule_requested",
  "admin_unassigned_request",
  "admin_service_completed",
  "admin_refund_requested",
  "admin_availability_submitted",
  "admin_follow_up_requested",
  "admin_no_show",
] as const;
export type NotificationType = (typeof notificationTypeValues)[number];

export function isKnownNotificationType(value: string): value is NotificationType {
  return (notificationTypeValues as readonly string[]).includes(value);
}

type Payload = Record<string, unknown>;

/** Values interpolated into `{service}`, `{start}`, `{amount}`, and `{household}` placeholders. */
export function notificationValues(
  payload: unknown,
  helpers: {
    serviceName: (serviceType: string) => string;
    formatDate: (iso: string) => string;
    formatAmount: (cents: number) => string;
  },
): Record<string, string> {
  const data: Payload =
    payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Payload) : {};
  const serviceType = typeof data.service_type === "string" ? data.service_type : "";
  const start = typeof data.start_at === "string" ? data.start_at : "";
  const amount = typeof data.amount_cents === "number" ? data.amount_cents : null;
  return {
    service: serviceType ? helpers.serviceName(serviceType) : "",
    start: start ? helpers.formatDate(start) : "",
    amount: amount === null ? "" : helpers.formatAmount(amount),
    household: typeof data.household_name === "string" ? data.household_name.slice(0, 160) : "",
  };
}

/** Only relative in-app paths are ever rendered as links. */
export function safeNotificationPath(path: string | null | undefined): string | null {
  if (!path || !/^\/[A-Za-z0-9/_?=&.-]*$/.test(path) || path.startsWith("//")) return null;
  return path;
}
