import { buildReminderSchedule, ReminderScheduleError, type ReminderOffset } from "./schedule";

export type ReminderRescheduleInput = {
  dueDate: string;
  localTime: string;
  offsetDays: ReminderOffset;
  timezone: string;
};

export type ReminderRescheduleResult =
  | {
      kind: "rescheduled";
      scheduledForUtc: string;
      scheduledLocalDate: string;
      timezoneOffsetMinutes: number;
    }
  | { cancellationReason: "roadmap_due_date_moved_to_past"; kind: "cancelled" };

/** Prepares trusted server-side schedule values for an atomic roadmap update. */
export function prepareReminderReschedule(input: ReminderRescheduleInput): ReminderRescheduleResult {
  try {
    return { kind: "rescheduled", ...buildReminderSchedule(input) };
  } catch (error) {
    if (error instanceof ReminderScheduleError)
      return { kind: "cancelled", cancellationReason: "roadmap_due_date_moved_to_past" };
    throw error;
  }
}
