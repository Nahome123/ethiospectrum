import { z } from "zod";
import {
  APPOINTMENT_MEETING_URL_MAX,
  appointmentDurationValues,
  appointmentModalityValues,
  appointmentStatusValues,
} from "@/lib/appointments/constants";
import { isSupportedTimezone } from "@/lib/appointments/scheduling";

export const appointmentRequestIdSchema = z.uuid();
export const appointmentIdSchema = z.uuid();
export const appointmentIdempotencyKeySchema = z.uuid();

/** Versions start at one and only ever increase server-side. */
export const appointmentExpectedVersionSchema = z
  .union([z.string(), z.number()])
  .refine((value) => typeof value === "number" || value.trim() !== "", {
    message: "An expected appointment version is required.",
  })
  .transform((value) => (typeof value === "number" ? value : Number(value)))
  .pipe(z.number().int().min(1).max(1_000_000_000));

export const appointmentStatusFilterSchema = z.enum(appointmentStatusValues);
export const appointmentModalitySchema = z.enum(appointmentModalityValues);
export const appointmentPageSchema = z.coerce.number().int().min(1).max(100_000);

export const appointmentDurationSchema = z.coerce
  .number()
  .int()
  .refine(
    (value): value is (typeof appointmentDurationValues)[number] =>
      (appointmentDurationValues as readonly number[]).includes(value),
    { message: "Choose a supported appointment length." },
  );

export const appointmentTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isSupportedTimezone, { message: "Choose a valid timezone." });

const calendarDate = /^\d{4}-\d{2}-\d{2}$/;
const clockTime = /^\d{2}:\d{2}$/;

export const appointmentLocalDateSchema = z.string().trim().regex(calendarDate, "Enter a valid date.");
export const appointmentLocalTimeSchema = z.string().trim().regex(clockTime, "Enter a valid time.");

/**
 * Only HTTPS links are accepted. javascript:, data:, and file: schemes are
 * rejected outright rather than sanitized.
 */
export const appointmentMeetingUrlSchema = z
  .string()
  .trim()
  .min(12)
  .max(APPOINTMENT_MEETING_URL_MAX)
  .refine(
    (value) => {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        return false;
      }
      return parsed.protocol === "https:" && parsed.hostname.length > 0;
    },
    { message: "Enter a secure https:// meeting link." },
  );

export function createAppointmentProposalSchema(messages: {
  date: string;
  time: string;
  timezone: string;
  duration: string;
  modality: string;
  meetingUrl: string;
}) {
  return z
    .object({
      localDate: appointmentLocalDateSchema.refine(() => true, messages.date),
      localTime: appointmentLocalTimeSchema.refine(() => true, messages.time),
      timezone: z.string().trim().min(1).max(64).refine(isSupportedTimezone, messages.timezone),
      durationMinutes: appointmentDurationSchema.refine(() => true, messages.duration),
      modality: z.enum(appointmentModalityValues, { message: messages.modality }),
      meetingUrl: z
        .string()
        .trim()
        .transform((value) => (value === "" ? null : value)),
    })
    .superRefine((value, context) => {
      if (value.modality === "video") {
        const result = appointmentMeetingUrlSchema.safeParse(value.meetingUrl ?? "");
        if (!result.success) {
          context.addIssue({ code: "custom", path: ["meetingUrl"], message: messages.meetingUrl });
        }
        return;
      }
      // A phone appointment must not carry a link at all.
      if (value.meetingUrl !== null) {
        context.addIssue({ code: "custom", path: ["meetingUrl"], message: messages.meetingUrl });
      }
    });
}

export function createAppointmentConsentSchema(message: string) {
  return z.object({
    acknowledged: z
      .union([z.string(), z.boolean()])
      .refine((value) => value === true || value === "true" || value === "on", message),
  });
}
