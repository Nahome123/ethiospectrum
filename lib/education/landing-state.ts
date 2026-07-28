export type EducationLandingState = "visitor" | "needs_household" | "ready";

export function deriveEducationLandingState({
  authenticated,
  hasHousehold,
}: {
  authenticated: boolean;
  hasHousehold: boolean;
}): EducationLandingState {
  if (!authenticated) return "visitor";
  return hasHousehold ? "ready" : "needs_household";
}
