import { z } from "zod";

/** Monday-first display order; values are JavaScript/Postgres weekdays (0 = Sunday). */
export const scheduleWeekdays = [1, 2, 3, 4, 5, 6, 0] as const;

export const commonScheduleZones = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "Africa/Addis_Ababa",
  "Europe/London",
  "UTC",
];

/** Every time zone the server knows, read on the server so the list matches what it validates. */
export function allTimeZones(): string[] {
  return [...Intl.supportedValuesOf("timeZone"), "UTC"];
}

export type WeeklyHour = { weekday: number; start: string; end: string };

/** Sessions start on the hour or half hour, so hours do too. */
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):(00|30)$/);
export const scheduleTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/);
export const meetingLinkSchema = z.union([z.url({ protocol: /^https$/ }).max(2048), z.literal("")]);
/** A Calendly scheduling page; the same rule as the database check. */
export const calendlyLinkSchema = z.union([
  z
    .string()
    .max(500)
    .regex(/^https:\/\/calendly\.com\/[A-Za-z0-9_./?=&%-]+$/),
  z.literal(""),
]);

/**
 * Reads one window per weekday from `start.{weekday}` / `end.{weekday}`
 * fields. A day left blank is closed; null when any filled day is invalid.
 */
export function parseWeeklyHours(read: (name: string) => string): WeeklyHour[] | null {
  const hours: WeeklyHour[] = [];
  for (const weekday of scheduleWeekdays) {
    const start = read(`start.${weekday}`);
    const end = read(`end.${weekday}`);
    if (!start && !end) continue;
    if (!timeSchema.safeParse(start).success || !timeSchema.safeParse(end).success || end <= start)
      return null;
    hours.push({ weekday, start, end });
  }
  return hours;
}
