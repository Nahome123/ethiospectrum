import { Temporal } from "@js-temporal/polyfill";

export const reminderOffsets = [7, 3, 1, 0] as const;
export const reminderStatuses = [
  "scheduled",
  "processing",
  "delivered",
  "failed",
  "cancelled",
  "skipped",
] as const;

export type ReminderOffset = (typeof reminderOffsets)[number];
export type ReminderStatus = (typeof reminderStatuses)[number];

export class ReminderScheduleError extends Error {
  constructor(
    public readonly code: "invalid_timezone" | "ambiguous_time" | "nonexistent_time" | "past_schedule",
  ) {
    super(code);
  }
}

export function buildReminderSchedule({
  dueDate,
  offsetDays,
  localTime,
  timezone,
  now = Temporal.Now.instant(),
}: {
  dueDate: string;
  offsetDays: ReminderOffset;
  localTime: string;
  timezone: string;
  now?: Temporal.Instant;
}) {
  let date: Temporal.PlainDate;
  let time: Temporal.PlainTime;
  try {
    date = Temporal.PlainDate.from(dueDate).subtract({ days: offsetDays });
    time = Temporal.PlainTime.from(localTime);
  } catch {
    throw new ReminderScheduleError("invalid_timezone");
  }
  const local = date.toPlainDateTime(time);
  let earlier: Temporal.ZonedDateTime;
  let later: Temporal.ZonedDateTime;
  try {
    earlier = local.toZonedDateTime(timezone, { disambiguation: "earlier" });
    later = local.toZonedDateTime(timezone, { disambiguation: "later" });
  } catch {
    throw new ReminderScheduleError("invalid_timezone");
  }
  if (!earlier.toPlainDateTime().equals(local) || !later.toPlainDateTime().equals(local)) {
    throw new ReminderScheduleError("nonexistent_time");
  }
  if (earlier.epochNanoseconds !== later.epochNanoseconds) throw new ReminderScheduleError("ambiguous_time");
  const instant = earlier.toInstant();
  if (Temporal.Instant.compare(instant, now.add({ minutes: 5 })) < 0)
    throw new ReminderScheduleError("past_schedule");
  return {
    scheduledLocalDate: date.toString(),
    scheduledForUtc: instant.toString(),
    timezoneOffsetMinutes: Math.round(Number(earlier.offsetNanoseconds) / 60_000_000_000),
  };
}
