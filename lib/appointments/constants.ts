export const appointmentStatusValues = [
  "proposed",
  "scheduled",
  "declined",
  "cancelled",
  "completed",
] as const;

export const appointmentModalityValues = ["video", "phone"] as const;

export const appointmentDurationValues = [30, 45, 60] as const;

export const appointmentCancellationReasonValues = [
  "household_cancelled",
  "specialist_cancelled",
  "reschedule_requested",
  "assignment_revoked",
  "request_closed",
  "request_cancelled",
] as const;

export const appointmentEventActionValues = [
  "proposed",
  "accepted",
  "declined",
  "cancelled",
  "completed",
] as const;

export type AppointmentStatus = (typeof appointmentStatusValues)[number];
export type AppointmentModality = (typeof appointmentModalityValues)[number];
export type AppointmentDuration = (typeof appointmentDurationValues)[number];
export type AppointmentCancellationReason = (typeof appointmentCancellationReasonValues)[number];
export type AppointmentEventAction = (typeof appointmentEventActionValues)[number];

/**
 * The server stores this identifier with each consent; the browser never
 * supplies it. Bump it only alongside a reviewed consent-copy change.
 */
export const APPOINTMENT_CONSENT_COPY_VERSION = "eth-027.v1";

export const APPOINTMENT_MIN_LEAD_HOURS = 24;
export const APPOINTMENT_MAX_HORIZON_DAYS = 90;
export const APPOINTMENT_MEETING_URL_MAX = 2000;
export const APPOINTMENT_MAX_ACTIVE_PER_REQUEST = 1;

const terminalStatuses: readonly AppointmentStatus[] = ["declined", "cancelled", "completed"];

/** The only ETH-027 transitions; a terminal appointment never reopens. */
export const appointmentStatusTransitions: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> =
  {
    proposed: ["scheduled", "declined", "cancelled"],
    scheduled: ["cancelled", "completed"],
    declined: [],
    cancelled: [],
    completed: [],
  };

export function canTransitionAppointment(current: AppointmentStatus, next: AppointmentStatus): boolean {
  return appointmentStatusTransitions[current].includes(next);
}

export function isTerminalAppointmentStatus(status: AppointmentStatus): boolean {
  return terminalStatuses.includes(status);
}

export function isLiveAppointmentStatus(status: AppointmentStatus): boolean {
  return status === "proposed" || status === "scheduled";
}

export type AppointmentHouseholdPermission = "owner" | "administrator" | "member" | "viewer";

/** Only the assigned specialist proposes; the household never picks the time. */
export function canProposeAppointment(isAssignedSpecialist: boolean, requestStatus: string): boolean {
  return isAssignedSpecialist && requestStatus === "open";
}

/** Consent is a caregiver act; viewers are read-only. */
export function canConsentToAppointment(
  permission: AppointmentHouseholdPermission | null,
  status: AppointmentStatus,
): boolean {
  return status === "proposed" && permission !== null && permission !== "viewer";
}

export function canCancelAppointment(
  permission: AppointmentHouseholdPermission | null,
  isAssignedSpecialist: boolean,
  status: AppointmentStatus,
): boolean {
  if (!isLiveAppointmentStatus(status)) return false;
  return (permission !== null && permission !== "viewer") || isAssignedSpecialist;
}

export function canCompleteAppointment(
  isAssignedSpecialist: boolean,
  status: AppointmentStatus,
  startsAt: Date,
  now: Date,
): boolean {
  return isAssignedSpecialist && status === "scheduled" && startsAt.getTime() <= now.getTime();
}

/** A platform administrator observes ETH-027 and never acts within it. */
export function canAdministratorActOnAppointment(): boolean {
  return false;
}

/** A phone appointment never carries a link; video always does. */
export function requiresMeetingUrl(modality: AppointmentModality): boolean {
  return modality === "video";
}
