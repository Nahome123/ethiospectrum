import { z } from "zod";
import {
  SPECIALIST_MESSAGE_MAX,
  SPECIALIST_MESSAGE_MIN,
  supportMessageAuthorKindValues,
} from "@/lib/specialists/constants";

export const specialistRequestIdSchema = z.uuid();
export const specialistProfileIdSchema = z.uuid();
export const specialistIdempotencyKeySchema = z.uuid();

/**
 * Assignment versions start at zero and only ever increase server-side. A blank
 * value is rejected rather than coerced, so a missing field can never be read as
 * the meaningful "unassigned" version zero.
 */
export const specialistExpectedAssignmentVersionSchema = z
  .union([z.string(), z.number()])
  .refine((value) => typeof value === "number" || value.trim() !== "", {
    message: "An expected assignment version is required.",
  })
  .transform((value) => (typeof value === "number" ? value : Number(value)))
  .pipe(z.number().int().min(0).max(1_000_000_000));

export const specialistPageSchema = z.coerce.number().int().min(1).max(100_000);

export const supportMessageAuthorKindSchema = z.enum(supportMessageAuthorKindValues);

export function createSpecialistMessageSchema(message: string) {
  return z.object({
    body: z.string().trim().min(SPECIALIST_MESSAGE_MIN, message).max(SPECIALIST_MESSAGE_MAX, message),
  });
}

export const assignSpecialistSchema = z.object({
  specialistId: specialistProfileIdSchema,
  expectedAssignmentVersion: specialistExpectedAssignmentVersionSchema,
});

export const revokeSpecialistSchema = z.object({
  expectedAssignmentVersion: specialistExpectedAssignmentVersionSchema,
});
