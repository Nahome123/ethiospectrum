import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerActionSupabaseClient: vi.fn(),
  getTranslations: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: mocks.createServerActionSupabaseClient,
}));
vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  acceptSupportAppointmentAction,
  cancelSupportAppointmentAction,
  completeSupportAppointmentAction,
  declineSupportAppointmentAction,
  proposeSupportAppointmentAction,
} from "@/lib/appointments/actions";

const idle = { status: "idle" } as const;
const requestId = "d4000000-0000-4000-8000-000000000001";
const appointmentId = "d5000000-0000-4000-8000-000000000001";
const idempotencyKey = "d5000000-0000-4000-8000-000000000002";

function proposalForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("localDate", "2026-09-15");
  form.set("localTime", "14:30");
  form.set("timezone", "America/New_York");
  form.set("durationMinutes", "45");
  form.set("modality", "video");
  form.set("meetingUrl", "https://meet.example.test/synthetic");
  form.set("idempotencyKey", idempotencyKey);
  // Browser-supplied identity and lifecycle values must never reach the RPC.
  form.set("householdId", "forged-browser-household");
  form.set("specialistId", "forged-browser-specialist");
  form.set("status", "scheduled");
  form.set("consentedBy", "forged-browser-consenter");
  form.set("consentCopyVersion", "forged-copy-version");
  form.set("consentedAt", "1999-01-01T00:00:00Z");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

function versionForm(version = "1", extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("expectedVersion", version);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

describe("appointment server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
  });

  it("proposes through the controlled RPC and ignores browser identity", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: appointmentId, version: 1 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await expect(proposeSupportAppointmentAction("en", requestId, idle, proposalForm())).resolves.toEqual({
      status: "success",
      message: "proposalCreated",
    });

    expect(rpc).toHaveBeenCalledWith("propose_support_appointment", {
      target_thread_id: requestId,
      input_local_datetime: "2026-09-15T14:30:00",
      input_timezone: "America/New_York",
      input_duration_minutes: 45,
      input_modality: "video",
      input_meeting_url: "https://meet.example.test/synthetic",
      input_idempotency_key: idempotencyKey,
      input_supersedes_appointment_id: undefined,
    });
    const calls = JSON.stringify(rpc.mock.calls);
    expect(calls).not.toContain("forged");
    expect(calls).not.toContain("1999-01-01");
  });

  it("sends a phone proposal with no meeting link", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: appointmentId, version: 1 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await proposeSupportAppointmentAction(
      "en",
      requestId,
      idle,
      proposalForm({ modality: "phone", meetingUrl: "" }),
    );
    expect(rpc.mock.calls[0][1]).toMatchObject({ input_modality: "phone", input_meeting_url: "" });
  });

  it.each([
    ["23P01", "conflictError"],
    ["23505", "activeAppointmentError"],
    ["22007", "nonexistentTimeError"],
    ["22008", "ambiguousTimeError"],
    ["40001", "staleError"],
    ["55000", "lifecycleError"],
    ["42501", "proposeError"],
  ])("maps proposal failure code %s to %s", async (code, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "raw detail" } });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const result = await proposeSupportAppointmentAction("en", requestId, idle, proposalForm());
    expect(result).toEqual({ status: "error", message });
    expect(JSON.stringify(result)).not.toContain("raw detail");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["non-https link", { meetingUrl: "http://insecure.example.test/x" }],
    ["javascript link", { meetingUrl: "javascript:alert(1)" }],
    ["phone with link", { modality: "phone" }],
    ["bad duration", { durationMinutes: "25" }],
    ["bad timezone", { timezone: "Not/AZone" }],
    ["missing idempotency key", { idempotencyKey: "not-a-uuid" }],
  ])("rejects %s before any database access", async (_label, overrides) => {
    await expect(
      proposeSupportAppointmentAction("en", requestId, idle, proposalForm(overrides)),
    ).resolves.toEqual({ status: "error", message: "validationError" });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("accepts with a server-controlled consent copy version", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: appointmentId, version: 2 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await expect(
      acceptSupportAppointmentAction(
        "am",
        requestId,
        appointmentId,
        idle,
        versionForm("1", { acknowledged: "on", consentCopyVersion: "forged-copy-version" }),
      ),
    ).resolves.toEqual({ status: "success", message: "appointmentScheduled" });

    expect(rpc).toHaveBeenCalledWith("accept_support_appointment", {
      target_appointment_id: appointmentId,
      expected_version: 1,
      input_consent_copy_version: "eth-027.v1",
      input_acknowledged: true,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("forged-copy-version");
  });

  it("refuses to accept without an acknowledgment", async () => {
    await expect(
      acceptSupportAppointmentAction("en", requestId, appointmentId, idle, versionForm("1")),
    ).resolves.toEqual({ status: "error", message: "validationError" });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("revalidates household, specialist, and administrator surfaces", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: appointmentId, version: 2 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await acceptSupportAppointmentAction(
      "es",
      requestId,
      appointmentId,
      idle,
      versionForm("1", { acknowledged: "on" }),
    );
    expect(mocks.revalidatePath.mock.calls.flat()).toEqual(
      expect.arrayContaining([
        "/es/support",
        `/es/support/${requestId}`,
        "/es/specialist/support-requests",
        `/es/specialist/support-requests/${requestId}`,
        "/es/admin/support-requests",
        `/es/admin/support-requests/${requestId}`,
      ]),
    );
  });

  it("declines with the expected version", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: appointmentId, version: 2 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await expect(
      declineSupportAppointmentAction("en", requestId, appointmentId, idle, versionForm("1")),
    ).resolves.toEqual({ status: "success", message: "appointmentDeclined" });
    expect(rpc).toHaveBeenCalledWith("decline_support_appointment", {
      target_appointment_id: appointmentId,
      expected_version: 1,
    });
  });

  it("distinguishes a plain cancellation from a reschedule request", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: appointmentId, version: 2 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await expect(
      cancelSupportAppointmentAction("en", requestId, appointmentId, idle, versionForm("1")),
    ).resolves.toEqual({ status: "success", message: "appointmentCancelled" });
    expect(rpc.mock.calls[0][1]).toMatchObject({ input_reschedule_requested: false });

    await expect(
      cancelSupportAppointmentAction(
        "en",
        requestId,
        appointmentId,
        idle,
        versionForm("1", { rescheduleRequested: "true" }),
      ),
    ).resolves.toEqual({ status: "success", message: "rescheduleRequested" });
    expect(rpc.mock.calls[1][1]).toMatchObject({ input_reschedule_requested: true });
  });

  it("completes with the expected version and maps lifecycle errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: appointmentId, version: 3 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await expect(
      completeSupportAppointmentAction("en", requestId, appointmentId, idle, versionForm("2")),
    ).resolves.toEqual({ status: "success", message: "appointmentCompleted" });

    rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "raw" } });
    await expect(
      completeSupportAppointmentAction("en", requestId, appointmentId, idle, versionForm("2")),
    ).resolves.toEqual({ status: "error", message: "lifecycleError" });
  });

  it.each([
    [
      "invalid appointment id",
      () => declineSupportAppointmentAction("en", requestId, "nope", idle, versionForm("1")),
    ],
    [
      "missing version",
      () => cancelSupportAppointmentAction("en", requestId, appointmentId, idle, new FormData()),
    ],
  ])("rejects %s before any database access", async (_label, action) => {
    await expect(action()).resolves.toEqual({ status: "error", message: "validationError" });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });
});
