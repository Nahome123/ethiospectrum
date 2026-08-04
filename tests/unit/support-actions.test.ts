import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerActionSupabaseClient: vi.fn(),
  getTranslations: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: mocks.createServerActionSupabaseClient,
}));
vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  addSupportRequestMessageAction,
  cancelSupportRequestAction,
  closeSupportRequestAction,
  createSupportRequestAction,
} from "@/lib/support/actions";

const idle = { status: "idle" } as const;
const requestId = "84000000-0000-4000-8000-000000000001";
const idempotencyKey = "84000000-0000-4000-8000-000000000002";

function createForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("subject", "School meeting help");
  form.set("category", "education");
  form.set("preferredLanguage", "am");
  form.set("description", "We need help preparing for an upcoming school evaluation meeting.");
  form.set("acknowledged", "on");
  form.set("idempotencyKey", idempotencyKey);
  form.set("userId", "forged-browser-user");
  form.set("householdId", "forged-browser-household");
  form.set("status", "closed");
  form.set("specialistId", "forged-browser-specialist");
  form.set("expectationsAcknowledgedAt", "1999-01-01T00:00:00Z");
  form.set("expectationsCopyVersion", "forged-copy-version");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe("support request server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
  });

  it("creates a request through the controlled RPC and ignores browser identity", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: requestId, version: 1 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await createSupportRequestAction("am", idle, createForm());

    expect(rpc).toHaveBeenCalledWith("create_support_request", {
      input_subject: "School meeting help",
      input_category: "education",
      input_preferred_language: "am",
      input_description: "We need help preparing for an upcoming school evaluation meeting.",
      input_acknowledged: true,
      input_idempotency_key: idempotencyKey,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("forged");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("1999-01-01");
    expect(mocks.revalidatePath.mock.calls.flat()).toEqual(
      expect.arrayContaining([
        "/am/support",
        "/am/admin/support-requests",
        `/am/support/${requestId}`,
        `/am/admin/support-requests/${requestId}`,
      ]),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(`/am/support/${requestId}`);
  });

  it.each([
    ["short subject", { subject: "Hey" }],
    ["missing acknowledgment", { acknowledged: "" }],
    ["invalid category", { category: "emergency" }],
    ["missing idempotency key", { idempotencyKey: "not-a-uuid" }],
  ])("rejects %s before any database access", async (_label, overrides) => {
    await expect(createSupportRequestAction("en", idle, createForm(overrides))).resolves.toEqual({
      status: "error",
      message: "validationError",
    });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps the open-request cap to a localized limit message", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "54000", message: "raw" } });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await expect(createSupportRequestAction("en", idle, createForm())).resolves.toEqual({
      status: "error",
      message: "maxOpenError",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sanitizes creation failures", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "internal SQL and private household UUID" },
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const result = await createSupportRequestAction("en", idle, createForm());
    expect(result).toEqual({ status: "error", message: "createError" });
    expect(JSON.stringify(result)).not.toContain("internal SQL");
  });

  it("adds a follow-up message through the controlled RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "message-id", version: 1 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const form = new FormData();
    form.set("body", "  A new update for our request.  ");
    form.set("idempotencyKey", idempotencyKey);
    form.set("userId", "forged-browser-user");

    await expect(addSupportRequestMessageAction("es", requestId, idle, form)).resolves.toEqual({
      status: "success",
      message: "messageAdded",
    });
    expect(rpc).toHaveBeenCalledWith("add_support_request_message", {
      target_thread_id: requestId,
      input_body: "A new update for our request.",
      input_idempotency_key: idempotencyKey,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("forged");
    expect(mocks.revalidatePath.mock.calls.flat()).toEqual(
      expect.arrayContaining(["/es/support", `/es/support/${requestId}`]),
    );
  });

  it.each([
    ["54000", "maxMessagesError"],
    ["55000", "closedMessageError"],
    ["42501", "messageCreateError"],
  ])("maps message failure code %s to %s", async (code, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "raw" } });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const form = new FormData();
    form.set("body", "A new update.");
    form.set("idempotencyKey", idempotencyKey);
    await expect(addSupportRequestMessageAction("en", requestId, idle, form)).resolves.toEqual({
      status: "error",
      message,
    });
  });

  it("closes a request with the expected concurrency version only", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: requestId, version: 2 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const form = new FormData();
    form.set("expectedVersion", "1");
    form.set("status", "open");

    await expect(closeSupportRequestAction("en", requestId, idle, form)).resolves.toEqual({
      status: "success",
      message: "requestClosed",
    });
    expect(rpc).toHaveBeenCalledWith("close_support_request", {
      target_thread_id: requestId,
      expected_version: 1,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("open");
  });

  it.each([
    ["40001", "staleError"],
    ["55000", "alreadyFinalError"],
    ["42501", "closeError"],
  ])("maps close failure code %s to %s", async (code, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "raw" } });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const form = new FormData();
    form.set("expectedVersion", "1");
    await expect(closeSupportRequestAction("en", requestId, idle, form)).resolves.toEqual({
      status: "error",
      message,
    });
  });

  it("cancels a request and maps stale versions safely", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: requestId, version: 2 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const form = new FormData();
    form.set("expectedVersion", "1");
    await expect(cancelSupportRequestAction("en", requestId, idle, form)).resolves.toEqual({
      status: "success",
      message: "requestCancelled",
    });
    expect(rpc).toHaveBeenCalledWith("cancel_support_request", {
      target_thread_id: requestId,
      expected_version: 1,
    });

    rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "raw" } });
    await expect(cancelSupportRequestAction("en", requestId, idle, form)).resolves.toEqual({
      status: "error",
      message: "staleError",
    });
  });

  it.each([
    ["invalid request id", () => closeSupportRequestAction("en", "not-a-uuid", idle, new FormData())],
    ["missing expected version", () => cancelSupportRequestAction("en", requestId, idle, new FormData())],
  ])("rejects %s before any database access", async (_label, action) => {
    await expect(action()).resolves.toEqual({ status: "error", message: "validationError" });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });
});
