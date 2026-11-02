import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { getRoleHomePath, hasSpecialistRole } from "@/lib/auth/role-session";
import { updateMyAvailabilityAction } from "@/lib/specialists/availability-actions";
import { parseWeeklyHours } from "@/lib/specialists/schedule";

const idle = { status: "idle" } as const;

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

describe("My availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("saves hours, link, languages and whether bookings are open", async () => {
    const result = await updateMyAvailabilityAction(
      "en",
      idle,
      form({
        timezone: "America/Chicago",
        meetingUrl: "https://meet.example.test/me",
        accepting: "on",
        choosesLanguages: "1",
        languages: ["en", "am"],
        "start.1": "09:00",
        "end.1": "12:00",
        "start.3": "13:00",
        "end.3": "17:00",
      }),
    );
    expect(result).toEqual({ status: "success", message: "scheduleSaved" });
    expect(mocks.rpc).toHaveBeenCalledWith("update_my_staff_schedule", {
      input_timezone: "America/Chicago",
      input_hours: [
        { weekday: 1, start: "09:00", end: "12:00" },
        { weekday: 3, start: "13:00", end: "17:00" },
      ],
      input_meeting_url: "https://meet.example.test/me",
      input_accepting_bookings: true,
      input_parent_support_languages: ["en", "am"],
    });
  });

  it("pauses bookings and leaves languages alone for specialists", async () => {
    await updateMyAvailabilityAction("en", idle, form({ timezone: "UTC", meetingUrl: "" }));
    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_my_staff_schedule",
      expect.objectContaining({
        input_accepting_bookings: false,
        input_parent_support_languages: undefined,
        input_hours: [],
      }),
    );
  });

  it("refuses invalid hours, links and an empty language choice before saving", async () => {
    const cases: Record<string, string>[] = [
      { timezone: "UTC", "start.1": "17:00", "end.1": "09:00" },
      { timezone: "UTC", "start.1": "09:15", "end.1": "10:00" },
      { timezone: "UTC", meetingUrl: "http://insecure.example.test" },
      { timezone: "UTC", choosesLanguages: "1" },
    ];
    for (const values of cases) {
      expect((await updateMyAvailabilityAction("en", idle, form(values))).status).toBe("error");
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("parses one window per weekday", () => {
    const fields: Record<string, string> = { "start.0": "10:00", "end.0": "11:30" };
    expect(parseWeeklyHours((name) => fields[name] ?? "")).toEqual([
      { weekday: 0, start: "10:00", end: "11:30" },
    ]);
  });

  it("sends Parent Support staff to the staff workspace", () => {
    expect(getRoleHomePath("am", "parent_support")).toBe("/am/specialist");
    expect(hasSpecialistRole("parent_support")).toBe(true);
    expect(hasSpecialistRole("member")).toBe(false);
  });
});
