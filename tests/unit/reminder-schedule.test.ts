import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import { buildReminderSchedule, ReminderScheduleError } from "@/lib/reminders/schedule";

describe("reminder schedules", () => {
  it("calculates an IANA schedule for each supported offset", () => {
    const now = Temporal.Instant.from("2026-01-01T00:00:00Z");
    expect(
      buildReminderSchedule({
        dueDate: "2026-01-10",
        offsetDays: 0,
        localTime: "09:00",
        timezone: "America/New_York",
        now,
      }).scheduledLocalDate,
    ).toBe("2026-01-10");
    expect(
      buildReminderSchedule({
        dueDate: "2026-01-10",
        offsetDays: 1,
        localTime: "09:00",
        timezone: "America/New_York",
        now,
      }).scheduledLocalDate,
    ).toBe("2026-01-09");
    expect(
      buildReminderSchedule({
        dueDate: "2026-01-10",
        offsetDays: 3,
        localTime: "09:00",
        timezone: "America/New_York",
        now,
      }).scheduledLocalDate,
    ).toBe("2026-01-07");
    expect(
      buildReminderSchedule({
        dueDate: "2026-01-10",
        offsetDays: 7,
        localTime: "09:00",
        timezone: "America/New_York",
        now,
      }).scheduledLocalDate,
    ).toBe("2026-01-03");
  });

  it("rejects daylight-saving ambiguous and nonexistent local times", () => {
    const now = Temporal.Instant.from("2026-01-01T00:00:00Z");
    expect(() =>
      buildReminderSchedule({
        dueDate: "2026-11-01",
        offsetDays: 0,
        localTime: "01:30",
        timezone: "America/New_York",
        now,
      }),
    ).toThrow(ReminderScheduleError);
    expect(() =>
      buildReminderSchedule({
        dueDate: "2026-03-08",
        offsetDays: 0,
        localTime: "02:30",
        timezone: "America/New_York",
        now,
      }),
    ).toThrow(ReminderScheduleError);
  });

  it("rejects schedules that are less than five minutes away", () => {
    expect(() =>
      buildReminderSchedule({
        dueDate: "2026-01-01",
        offsetDays: 0,
        localTime: "00:04",
        timezone: "Etc/UTC",
        now: Temporal.Instant.from("2026-01-01T00:00:00Z"),
      }),
    ).toThrow("past_schedule");
  });
});
