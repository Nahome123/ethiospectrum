export type OnboardingActionState =
  { status: "idle" } | { status: "error"; message: string; householdName?: string };

export const initialOnboardingActionState: OnboardingActionState = { status: "idle" };
