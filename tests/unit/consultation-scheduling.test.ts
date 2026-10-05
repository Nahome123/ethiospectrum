import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), redirect: vi.fn() }));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/services/revalidate", () => ({ revalidateServiceRequest: vi.fn() }));

import { createConsultationRequestAction } from "@/lib/services/actions";
import { requestedScheduleSchema } from "@/lib/validation/services";

const requestId = "11111111-1111-4111-8111-111111111111";
const idle = { status: "idle" } as const;

function bookingForm(mode: string, starts: string[]) {
  const data = new FormData();
  data.set("dependentId", "22222222-2222-4222-8222-222222222222");
  data.set("description", "We would like guidance on daily routines at home.");
  data.set("category", "general_guidance");
  data.set("topicKey", "");
  data.set("preferredLanguage", "en");
  data.set("idempotencyKey", "33333333-3333-4333-8333-333333333333");
  data.set("schedulingMode", mode);
  data.set("slotCount", String(starts.length));
  data.set("timezone", "America/Chicago");
  starts.forEach((start, index) => data.set(`slot.${index}.localStart`, start));
  return data;
}

describe("consultation scheduling choice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "create_service_request" ? { data: requestId, error: null } : { data: null, error: null },
    );
  });

  it("accepts one direct time or two to three proposed times", () => {
    const slot = { localStart: "2026-11-02T10:00", timezone: "America/Chicago" };
    expect(requestedScheduleSchema.safeParse({ mode: "direct", slots: [slot] }).success).toBe(true);
    expect(requestedScheduleSchema.safeParse({ mode: "direct", slots: [slot, slot] }).success).toBe(false);
    expect(requestedScheduleSchema.safeParse({ mode: "propose", slots: [slot] }).success).toBe(false);
    expect(requestedScheduleSchema.safeParse({ mode: "propose", slots: [slot, slot, slot] }).success).toBe(
      true,
    );
  });

  it("stores a direct time with the new request", async () => {
    await createConsultationRequestAction("en", idle, bookingForm("direct", ["2026-11-02T10:00"]));
    expect(mocks.rpc).toHaveBeenCalledWith("set_requested_schedule", {
      target_request_id: requestId,
      input_mode: "direct",
      input_slots: [{ local_start: "2026-11-02T10:00", timezone: "America/Chicago" }],
    });
    expect(mocks.redirect).toHaveBeenCalledWith(`/en/requests/${requestId}?created=1`);
  });

  it("stores proposed options", async () => {
    await createConsultationRequestAction(
      "en",
      idle,
      bookingForm("propose", ["2026-11-02T10:00", "2026-11-03T15:30"]),
    );
    expect(
      mocks.rpc.mock.calls.find(([name]) => name === "set_requested_schedule")?.[1].input_slots,
    ).toHaveLength(2);
  });

  it("refuses a proposal with a single option before creating anything", async () => {
    const result = await createConsultationRequestAction(
      "en",
      idle,
      bookingForm("propose", ["2026-11-02T10:00"]),
    );
    expect(result.status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps the request and tells the family when the times are refused", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "create_service_request"
        ? { data: requestId, error: null }
        : { data: null, error: { code: "22007" } },
    );
    await createConsultationRequestAction("en", idle, bookingForm("direct", ["2026-03-08T02:30"]));
    expect(mocks.redirect).toHaveBeenCalledWith(`/en/requests/${requestId}?created=1&scheduleError=1`);
  });
});
