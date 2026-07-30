import { z } from "zod";
import { reminderOffsets } from "@/lib/reminders/schedule";

export const reminderCreateSchema = z.object({
  roadmapItemId: z.uuid(),
  offsetDays: z.union(reminderOffsets.map((value) => z.literal(value))),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(128),
  consent: z.literal("on"),
  consentVersion: z.literal("2026-07-30"),
  idempotencyKey: z.uuid(),
});

export const reminderIdSchema = z.uuid();

export const reminderUpdateSchema = z.object({
  offsetDays: z.union(reminderOffsets.map((value) => z.literal(value))),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(128),
  expectedScheduleVersion: z.coerce.number().int().positive(),
});
