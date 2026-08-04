import { z } from "zod";
import {
  SUPPORT_DESCRIPTION_MAX,
  SUPPORT_DESCRIPTION_MIN,
  SUPPORT_MESSAGE_MAX,
  SUPPORT_MESSAGE_MIN,
  SUPPORT_SUBJECT_MAX,
  SUPPORT_SUBJECT_MIN,
  supportCategoryValues,
  supportLanguageValues,
  supportStatusValues,
} from "@/lib/support/constants";

export function createSupportRequestSchema(messages: {
  subject: string;
  description: string;
  acknowledgment: string;
}) {
  return z.object({
    subject: z
      .string()
      .trim()
      .min(SUPPORT_SUBJECT_MIN, messages.subject)
      .max(SUPPORT_SUBJECT_MAX, messages.subject),
    category: z.enum(supportCategoryValues),
    preferredLanguage: z.enum(supportLanguageValues),
    description: z
      .string()
      .trim()
      .min(SUPPORT_DESCRIPTION_MIN, messages.description)
      .max(SUPPORT_DESCRIPTION_MAX, messages.description),
    acknowledged: z
      .union([z.string(), z.boolean()])
      .refine((value) => value === true || value === "true" || value === "on", messages.acknowledgment),
  });
}

export function createSupportMessageSchema(message: string) {
  return z.object({
    body: z.string().trim().min(SUPPORT_MESSAGE_MIN, message).max(SUPPORT_MESSAGE_MAX, message),
  });
}

export const supportIdempotencyKeySchema = z.uuid();
export const supportRequestIdSchema = z.uuid();

export const supportExpectedVersionSchema = z.coerce.number().int().min(1).max(1_000_000_000);

export const supportStatusFilterSchema = z.enum(supportStatusValues);
export const supportCategoryFilterSchema = z.enum(supportCategoryValues);
export const supportPageSchema = z.coerce.number().int().min(1).max(100_000);
