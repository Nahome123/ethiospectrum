export const specialistAssignmentActionValues = ["assigned", "revoked"] as const;

export const specialistRevocationReasonValues = [
  "administrator_revoked",
  "request_closed",
  "request_cancelled",
] as const;

export const specialistAvailabilityValues = ["available", "unavailable"] as const;

export const supportMessageAuthorKindValues = ["caregiver", "specialist"] as const;

export type SpecialistAssignmentAction = (typeof specialistAssignmentActionValues)[number];
export type SpecialistRevocationReason = (typeof specialistRevocationReasonValues)[number];
export type SpecialistAvailability = (typeof specialistAvailabilityValues)[number];
export type SupportMessageAuthorKind = (typeof supportMessageAuthorKindValues)[number];

export const SPECIALIST_MESSAGE_MIN = 1;
export const SPECIALIST_MESSAGE_MAX = 2000;
export const SPECIALIST_WORKLOAD_PAGE_SIZE = 10;

/**
 * A request holds at most one active specialist. ETH-026 sets no workload cap
 * and no expiry, so eligibility is the only gate on assignment.
 */
export const SPECIALIST_MAX_ACTIVE_PER_REQUEST = 1;

export function isEligibleSpecialistAvailability(availability: string): boolean {
  return availability === "available";
}

/** Assignment is only ever created or revoked on an open request. */
export function canAssignSpecialist(status: string, assignedSpecialistId: string | null): boolean {
  return status === "open" && assignedSpecialistId === null;
}

export function canRevokeSpecialist(status: string, assignedSpecialistId: string | null): boolean {
  return status === "open" && assignedSpecialistId !== null;
}

/** Only a platform administrator may change an assignment. */
export function canAdministerAssignment(role: string | null): boolean {
  return role === "administrator";
}

/** A specialist may respond only while actively assigned to an open request. */
export function canSpecialistRespond(status: string, isAssignedSpecialist: boolean): boolean {
  return status === "open" && isAssignedSpecialist;
}

/** Revocation reasons the database records when a household ends a request. */
export function revocationReasonForStatus(status: string): SpecialistRevocationReason | null {
  if (status === "closed") return "request_closed";
  if (status === "cancelled") return "request_cancelled";
  return null;
}
