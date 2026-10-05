import { z } from "zod";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  INSTRUCTIONS_MAX,
  LOCATION_DETAILS_MAX,
  MAX_PROPOSED_SLOTS,
  MESSAGE_MAX,
  NOTES_MAX,
  REASON_MAX,
  RELEVANT_INFORMATION_MAX,
  activityStatusValues,
  adminQueueValues,
  consultationCategoryValues,
  deliveryMethodValues,
  iepLanguageValues,
  iepServiceValues,
  inPersonLocationValues,
  overridableStatusValues,
  sessionLanguageValues,
} from "@/lib/services/constants";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

export const uuidSchema = z.uuid();
export const expectedVersionSchema = z.coerce.number().int().min(1).max(1_000_000_000);

export function createConsultationRequestSchema(messages: { description: string; dependent: string }) {
  return z.object({
    dependentId: z.uuid(messages.dependent),
    description: z
      .string()
      .trim()
      .min(DESCRIPTION_MIN, messages.description)
      .max(DESCRIPTION_MAX, messages.description),
    relevantInformation: optionalText(RELEVANT_INFORMATION_MAX),
    category: z.enum(consultationCategoryValues),
    topicKey: z
      .string()
      .trim()
      .regex(/^([a-z][a-z0-9_]{1,62})?$/)
      .transform((value) => (value === "" ? null : value)),
    preferredLanguage: z.enum(sessionLanguageValues),
  });
}

export function createIepRequestSchema(messages: {
  description: string;
  dependent: string;
  services: string;
  location: string;
  meetingDate: string;
}) {
  return z
    .object({
      dependentId: z.uuid(messages.dependent),
      description: z
        .string()
        .trim()
        .min(DESCRIPTION_MIN, messages.description)
        .max(DESCRIPTION_MAX, messages.description),
      relevantInformation: optionalText(RELEVANT_INFORMATION_MAX),
      language: z.enum(iepLanguageValues),
      services: z.array(z.enum(iepServiceValues)).min(1, messages.services).max(3),
      deliveryMethod: z.enum(deliveryMethodValues),
      locationType: z
        .union([z.enum(inPersonLocationValues), z.literal("")])
        .transform((value) => (value === "" ? null : value)),
      locationDetails: optionalText(LOCATION_DETAILS_MAX),
      meetingDate: z
        .string()
        .trim()
        .regex(/^(\d{4}-\d{2}-\d{2})?$/, messages.meetingDate)
        .transform((value) => (value === "" ? null : value)),
    })
    .superRefine((value, context) => {
      if (value.deliveryMethod === "in_person" && !value.locationType) {
        context.addIssue({ code: "custom", path: ["locationType"], message: messages.location });
      }
      if (
        value.deliveryMethod === "in_person" &&
        (value.locationType === "school_meeting" || value.locationType === "mutually_agreed") &&
        !value.locationDetails
      ) {
        context.addIssue({ code: "custom", path: ["locationDetails"], message: messages.location });
      }
    });
}

export const appointmentSlotSchema = z.object({
  localStart: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/),
  locationType: z
    .union([z.enum(inPersonLocationValues), z.literal("remote"), z.literal("")])
    .transform((value) => (value === "" ? null : value)),
  locationDetails: optionalText(LOCATION_DETAILS_MAX),
  meetingUrl: z
    .union([z.url({ protocol: /^https$/ }).max(2048), z.literal("")])
    .transform((value) => (value === "" ? null : value)),
  instructions: optionalText(INSTRUCTIONS_MAX),
});
export type AppointmentSlotInput = z.infer<typeof appointmentSlotSchema>;

/** A family's requested time(s) when booking: one direct time, or two to three options. */
export const requestedScheduleSchema = z
  .object({
    mode: z.enum(["direct", "propose"]),
    slots: z
      .array(
        z.object({
          localStart: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
          timezone: z
            .string()
            .trim()
            .min(1)
            .max(64)
            .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/),
        }),
      )
      .min(1)
      .max(3),
  })
  .refine(({ mode, slots }) => (mode === "direct" ? slots.length === 1 : slots.length >= 2), {
    path: ["slots"],
  });

export const appointmentSlotsSchema = z.array(appointmentSlotSchema).min(1).max(MAX_PROPOSED_SLOTS);

export function toDatabaseSlot(slot: AppointmentSlotInput) {
  return {
    local_start: slot.localStart,
    timezone: slot.timezone,
    location_type: slot.locationType,
    location_details: slot.locationDetails,
    meeting_url: slot.meetingUrl,
    instructions: slot.instructions,
  };
}

export const appointmentKindSchema = z.enum(["primary", "follow_up"]);
export const messageSchema = z.string().trim().min(1).max(MESSAGE_MAX);
export const reasonSchema = z.string().trim().min(2).max(REASON_MAX);
export const optionalReasonSchema = optionalText(REASON_MAX);
export const notesSchema = z.string().trim().min(2).max(NOTES_MAX);
export const optionalNotesSchema = optionalText(NOTES_MAX);
export const activityStatusSchema = z.enum(activityStatusValues);
export const outcomeSchema = z.enum(["completed", "no_show"]);
export const overrideStatusSchema = z.enum(overridableStatusValues);
export const adminQueueSchema = z.enum([...adminQueueValues, "all", "declined"]);
export const refundAmountSchema = z.coerce.number().int().min(1).max(1_000_000);
export const moneyInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,5}(\.\d{1,2})?$/)
  .transform((value) => Math.round(Number(value) * 100));
