import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/services/revalidate", () => ({ revalidateServiceRequest: vi.fn() }));

import { serviceErrorKey } from "@/lib/services/action-state";
import { requestParentSupportAction } from "@/lib/services/actions";
import { approveParentSupportAction, completeParentSupportAction } from "@/lib/services/staff-actions";

const idle = { status: "idle" } as const;
const requestId = "30000000-0000-4000-8000-000000000001";
const dependentId = "40000000-0000-4000-8000-000000000001";
const key = "50000000-0000-4000-8000-000000000001";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.append(name, value);
  return data;
}

describe("Parent Support requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: requestId, error: null });
  });

  it("sends the request and opens it", async () => {
    await expect(
      requestParentSupportAction(
        "en",
        idle,
        form({ dependentId, idempotencyKey: key, language: "am", description: "  Bedtime has been hard.  " }),
      ),
    ).rejects.toThrow(`redirect:/en/requests/${requestId}?created=1`);
    expect(mocks.rpc).toHaveBeenCalledWith("request_parent_support", {
      input_dependent_id: dependentId,
      input_description: "Bedtime has been hard.",
      input_language: "am",
      input_idempotency_key: key,
    });
  });

  it("refuses a short note or an unknown language before calling the database", async () => {
    for (const values of [
      { dependentId, idempotencyKey: key, language: "en", description: "Hi" },
      { dependentId, idempotencyKey: key, language: "fr", description: "Bedtime has been hard." },
    ]) {
      expect((await requestParentSupportAction("en", idle, form(values))).status).toBe("error");
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("lets an administrator approve and complete it", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    await expect(
      approveParentSupportAction("en", requestId, idle, form({ expectedVersion: "3" })),
    ).resolves.toEqual({ status: "success", message: "parentSupportApproved" });
    expect(mocks.rpc).toHaveBeenCalledWith("admin_approve_parent_support", {
      target_request_id: requestId,
      expected_version: 3,
    });
    await completeParentSupportAction("en", requestId, idle, form({ expectedVersion: "4" }));
    expect(mocks.rpc).toHaveBeenLastCalledWith("admin_complete_parent_support", {
      target_request_id: requestId,
      expected_version: 4,
    });
  });

  it("explains when no provider has a Calendly link", () => {
    expect(serviceErrorKey("ES428")).toBe("noParentSupportProvider");
  });
});
