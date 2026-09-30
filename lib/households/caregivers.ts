/** Owner-grantable caregiver permissions (PRD sections 5.2 and 6). */
export const caregiverPermissionValues = [
  "submit_requests",
  "confirm_appointments",
  "make_payments",
  "access_training",
  "upload_documents",
  "manage_subscription",
] as const;
export type CaregiverPermission = (typeof caregiverPermissionValues)[number];

/** Launch default: dependents, service requests, appointments, and training. */
export const defaultCaregiverPermissions: readonly CaregiverPermission[] = [
  "submit_requests",
  "confirm_appointments",
  "access_training",
  "upload_documents",
];
