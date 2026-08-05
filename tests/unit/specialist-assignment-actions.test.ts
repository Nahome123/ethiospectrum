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
  addSpecialistSupportMessageAction,
  assignSpecialistToSupportRequestAction,
  revokeSpecialistFromSupportRequestAction,
} from "@/lib/specialists/actions";

const idle = { status: "idle" } as const;
const requestId = "a4000000-0000-4000-8000-000000000001";
const specialistId = "a3000000-0000-4000-8000-000000000001";
const idempotencyKey = "a5000000-0000-4000-8000-000000000001";

function assignForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("specialistId", specialistId);
  form.set("expectedAssignmentVersion", "0");
  // Browser-supplied identity and lifecycle values must never reach the RPC.
  form.set("actorId", "forged-browser-actor");
  form.set("householdId", "forged-browser-household");
  form.set("role", "administrator");
  form.set("status", "closed");
  form.set("authorKind", "specialist");
  form.set("assignedAt", "1999-01-01T00:00:00Z");
  form.set("action", "assigned");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe("specialist assignment server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
  });

  it("assigns through the controlled RPC and ignores browser-supplied identity", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: requestId, assignment_version: 1 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await expect(
      assignSpecialistToSupportRequestAction("en", requestId, idle, assignForm()),
    ).resolves.toEqual({ status: "success", message: "assignmentCreated" });

    expect(rpc).toHaveBeenCalledWith("assign_specialist_to_support_request", {
      target_thread_id: requestId,
      target_specialist_id: specialistId,
      expected_assignment_version: 0,
    });
    const calls = JSON.stringify(rpc.mock.calls);
    expect(calls).not.toContain("forged");
    expect(calls).not.toContain("1999-01-01");
    expect(calls).not.toContain("authorKind");
  });

  it("revalidates every surface that shows an assignment", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: requestId, assignment_version: 1 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await assignSpecialistToSupportRequestAction("am", requestId, idle, assignForm());

    expect(mocks.revalidatePath.mock.calls.flat()).toEqual(
      expect.arrayContaining([
        "/am/admin/support-requests",
        `/am/admin/support-requests/${requestId}`,
        "/am/admin/specialists",
        "/am/support",
        `/am/support/${requestId}`,
        "/am/specialist/support-requests",
        `/am/specialist/support-requests/${requestId}`,
      ]),
    );
  });

  it.each([
    ["40001", "staleError"],
    ["23505", "alreadyAssignedError"],
    ["55000", "closedAssignmentError"],
    ["42501", "assignError"],
    ["22023", "assignError"],
  ])("maps assignment failure code %s to %s", async (code, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "raw internal detail" } });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const result = await assignSpecialistToSupportRequestAction("en", requestId, idle, assignForm());
    expect(result).toEqual({ status: "error", message });
    expect(JSON.stringify(result)).not.toContain("raw internal detail");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid request id", () => assignSpecialistToSupportRequestAction("en", "nope", idle, assignForm())],
    [
      "invalid specialist id",
      () =>
        assignSpecialistToSupportRequestAction(
          "en",
          requestId,
          idle,
          assignForm({ specialistId: "not-a-uuid" }),
        ),
    ],
    [
      "missing expected version",
      () =>
        assignSpecialistToSupportRequestAction(
          "en",
          requestId,
          idle,
          assignForm({ expectedAssignmentVersion: "" }),
        ),
    ],
  ])("rejects %s before any database access", async (_label, action) => {
    await expect(action()).resolves.toEqual({ status: "error", message: "validationError" });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("revokes with the expected assignment version only", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: requestId, assignment_version: 2 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const form = new FormData();
    form.set("expectedAssignmentVersion", "1");
    form.set("specialistId", "forged-browser-specialist");

    await expect(revokeSpecialistFromSupportRequestAction("es", requestId, idle, form)).resolves.toEqual({
      status: "success",
      message: "assignmentRevoked",
    });
    expect(rpc).toHaveBeenCalledWith("revoke_specialist_from_support_request", {
      target_thread_id: requestId,
      expected_assignment_version: 1,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("forged");
  });

  it.each([
    ["40001", "staleError"],
    ["55000", "notAssignedError"],
    ["42501", "revokeError"],
  ])("maps revocation failure code %s to %s", async (code, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "raw" } });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const form = new FormData();
    form.set("expectedAssignmentVersion", "1");
    await expect(revokeSpecialistFromSupportRequestAction("en", requestId, idle, form)).resolves.toEqual({
      status: "error",
      message,
    });
  });

  it("adds a specialist response without accepting a browser author kind", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ id: "message-id", assignment_version: 1 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const form = new FormData();
    form.set("body", "  A specialist response.  ");
    form.set("idempotencyKey", idempotencyKey);
    form.set("authorKind", "caregiver");
    form.set("senderId", "forged-browser-sender");

    await expect(addSpecialistSupportMessageAction("en", requestId, idle, form)).resolves.toEqual({
      status: "success",
      message: "responseAdded",
    });
    expect(rpc).toHaveBeenCalledWith("add_specialist_support_message", {
      target_thread_id: requestId,
      input_body: "A specialist response.",
      input_idempotency_key: idempotencyKey,
    });
    const calls = JSON.stringify(rpc.mock.calls);
    expect(calls).not.toContain("forged");
    expect(calls).not.toContain("caregiver");
    expect(mocks.revalidatePath.mock.calls.flat()).toEqual(
      expect.arrayContaining([
        `/en/support/${requestId}`,
        "/en/specialist/support-requests",
        `/en/specialist/support-requests/${requestId}`,
      ]),
    );
  });

  it.each([
    ["54000", "maxMessagesError"],
    ["55000", "closedResponseError"],
    ["42501", "responseCreateError"],
  ])("maps specialist response failure code %s to %s", async (code, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "raw" } });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const form = new FormData();
    form.set("body", "A specialist response.");
    form.set("idempotencyKey", idempotencyKey);
    await expect(addSpecialistSupportMessageAction("en", requestId, idle, form)).resolves.toEqual({
      status: "error",
      message,
    });
  });

  it("rejects an empty or oversized response before any database access", async () => {
    const form = new FormData();
    form.set("body", "   ");
    form.set("idempotencyKey", idempotencyKey);
    await expect(addSpecialistSupportMessageAction("en", requestId, idle, form)).resolves.toEqual({
      status: "error",
      message: "validationError",
    });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });
});
