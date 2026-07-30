import { describe, expect, it } from "vitest";
import { prepareReminderReschedule } from "@/lib/reminders/reschedule";

describe("trusted reminder rescheduling preparation", () => {
  it("preserves local scheduling inputs and produces an authoritative UTC schedule", () => {
    const result = prepareReminderReschedule({
      dueDate: "2026-12-31",
      offsetDays: 3,
      localTime: "09:00",
      timezone: "America/New_York",
    });
    expect(result.kind).toBe("rescheduled");
    if (result.kind === "rescheduled") expect(result.scheduledLocalDate).toBe("2026-12-28");
  });
});
