import { z } from "zod";

export const createHouseholdNameSchema = (message: string) =>
  z.object({
    householdName: z.string().trim().min(1, message).max(160, message),
  });

export const createOnboardingSchema = (messages: { householdName: string; consent: string }) =>
  createHouseholdNameSchema(messages.householdName).extend({
    consentAccepted: z.boolean().refine((value) => value, messages.consent),
  });

export type OnboardingInput = z.infer<ReturnType<typeof createOnboardingSchema>>;
export type HouseholdNameInput = z.infer<ReturnType<typeof createHouseholdNameSchema>>;
