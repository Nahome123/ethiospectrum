export const supportCategoryValues = [
  "general",
  "benefits",
  "education",
  "healthcare_navigation",
  "therapy_support",
  "housing",
  "transportation",
  "documentation",
  "other",
] as const;

export const supportLanguageValues = ["en", "am", "es"] as const;

export const supportStatusValues = ["open", "closed", "cancelled"] as const;

export type SupportCategory = (typeof supportCategoryValues)[number];
export type SupportLanguage = (typeof supportLanguageValues)[number];
export type SupportStatus = (typeof supportStatusValues)[number];

export const SUPPORT_SUBJECT_MIN = 5;
export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_DESCRIPTION_MIN = 20;
export const SUPPORT_DESCRIPTION_MAX = 3000;
export const SUPPORT_MESSAGE_MIN = 1;
export const SUPPORT_MESSAGE_MAX = 2000;
export const SUPPORT_MAX_OPEN_REQUESTS = 5;
export const SUPPORT_MAX_MESSAGES = 50;
export const SUPPORT_PAGE_SIZE = 10;

/**
 * The server stores this controlled identifier with each acknowledgment; the
 * browser never supplies it. Bump it only together with a reviewed copy change.
 */
export const SUPPORT_EXPECTATIONS_COPY_VERSION = "eth-025.v1";

/** The only ETH-025 lifecycle transitions; reopening is not supported. */
export const supportStatusTransitions: Readonly<Record<SupportStatus, readonly SupportStatus[]>> = {
  open: ["closed", "cancelled"],
  closed: [],
  cancelled: [],
};

export function canTransitionSupportStatus(current: SupportStatus, next: SupportStatus): boolean {
  return supportStatusTransitions[current].includes(next);
}

export type SupportHouseholdPermission = "owner" | "administrator" | "member" | "viewer";

export function canCreateSupportRequest(permission: SupportHouseholdPermission): boolean {
  return permission !== "viewer";
}

export function canAddSupportMessage(permission: SupportHouseholdPermission, status: SupportStatus): boolean {
  return status === "open" && permission !== "viewer";
}

export function canCloseOrCancelSupportRequest(
  permission: SupportHouseholdPermission,
  isRequester: boolean,
  status: SupportStatus,
): boolean {
  if (status !== "open" || permission === "viewer") return false;
  if (permission === "owner" || permission === "administrator") return true;
  return isRequester;
}
