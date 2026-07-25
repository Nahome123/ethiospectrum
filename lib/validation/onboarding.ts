import { z } from "zod";

const supportedLocales = ["en", "am", "es"] as const;

export function isSupportedTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const createOnboardingSchema = (messages: {
  consent: string;
  firstName: string;
  householdName: string;
  lastName: string;
  preferredLocale: string;
  timezone: string;
}) =>
  z.object({
    firstName: z.string().trim().min(1, messages.firstName).max(80, messages.firstName),
    lastName: z.string().trim().max(80, messages.lastName),
    householdName: z.string().trim().min(1, messages.householdName).max(160, messages.householdName),
    preferredLocale: z.enum(supportedLocales, { error: messages.preferredLocale }),
    timezone: z
      .string()
      .trim()
      .min(1, messages.timezone)
      .max(64, messages.timezone)
      .refine(isSupportedTimeZone, messages.timezone),
    consentAccepted: z.boolean().refine((value) => value, messages.consent),
  });

export type OnboardingInput = z.infer<ReturnType<typeof createOnboardingSchema>>;
