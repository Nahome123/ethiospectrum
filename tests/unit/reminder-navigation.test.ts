import { describe, expect, it } from "vitest";
import { formatUnseenReminderCount } from "@/lib/reminders/server";

describe("unseen reminder count formatting", () => {
  it("hides zero and caps the visual count at 99+", () => {
    expect(formatUnseenReminderCount(0)).toBeNull();
    expect(formatUnseenReminderCount(1)).toBe("1");
    expect(formatUnseenReminderCount(99)).toBe("99");
    expect(formatUnseenReminderCount(100)).toBe("99+");
  });
});
