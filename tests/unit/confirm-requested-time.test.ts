import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), redirect: vi.fn() }));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/services/revalidate", () => ({ revalidateServiceRequest: vi.fn() }));

import { createIepRequestAction } from "@/lib/services/actions";
import { confirmRequestedTimeAction } from "@/lib/services/staff-actions";

const requestId = "11111111-1111-4111-8111-111111111111";
const idle = { status: "idle" } as const;

function iepForm(start: string) {
  const data = new FormData();
  data.set("dependentId", "22222222-2222-4222-8222-222222222222");
  data.set("description", "Please explain the IEP goals in Amharic.");
  data.set("language", "am");
  data.append("services", "iep_explanation");
  data.set("deliveryMethod", "remote");
  data.set("locationType", "");
  data.set("idempotencyKey", "33333333-3333-4333-8333-333333333333");
  data.set("schedulingMode", "direct");
  data.set("slotCount", "1");
  data.set("timezone", "America/Chicago");
  if (start) data.set("slot.0.localStart", start);
  return data;
}

function confirmForm(fields: Record<string, string>) {
  const data = new FormData();
  Object.entries({ slotIndex: "0", meetingUrl: "", expectedVersion: "3", ...fields }).forEach(
    ([key, value]) => data.set(key, value),
  );
  return data;
}

describe("simple scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "create_service_request" ? { data: requestId, error: null } : { data: null, error: null },
    );
  });

  it("stores the time the family picked for an IEP session", async () => {
    await createIepRequestAction("en", idle, iepForm("2026-11-02T10:00"));
    expect(mocks.rpc).toHaveBeenCalledWith("set_requested_schedule", {
      target_request_id: requestId,
      input_mode: "direct",
      input_slots: [{ local_start: "2026-11-02T10:00", timezone: "America/Chicago" }],
    });
    expect(mocks.redirect).toHaveBeenCalledWith(`/en/requests/${requestId}?created=1`);
  });

  it("needs a time before creating an IEP request", async () => {
    const result = await createIepRequestAction("en", idle, iepForm(""));
    expect(result.status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("confirms the requested time with an optional meeting link", async () => {
    const result = await confirmRequestedTimeAction(
      "en",
      requestId,
      idle,
      confirmForm({ meetingUrl: "https://meet.example.test/room" }),
    );
    expect(result.status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("confirm_requested_time", {
      target_request_id: requestId,
      input_slot_index: 0,
      input_meeting_url: "https://meet.example.test/room",
      expected_version: 3,
    });
  });

  it("refuses a meeting link that is not HTTPS", async () => {
    const result = await confirmRequestedTimeAction(
      "en",
      requestId,
      idle,
      confirmForm({ meetingUrl: "http://meet.example.test" }),
    );
    expect(result.status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
