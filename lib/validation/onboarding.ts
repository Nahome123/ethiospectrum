import { z } from "zod";

export const createOnboardingSchema = (messages: { householdName: string; consent: string }) =>
  z.object({
    householdName: z.string().trim().min(1, messages.householdName).max(160, messages.householdName),
    consentAccepted: z.boolean().refine((value) => value, messages.consent),
  });

export type OnboardingInput = z.infer<ReturnType<typeof createOnboardingSchema>>;
