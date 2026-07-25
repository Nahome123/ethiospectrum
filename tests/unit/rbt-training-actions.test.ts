import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerActionSupabaseClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: mocks.createServerActionSupabaseClient,
}));
vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));

import { markRbtSectionCompleteAction, recordRbtSectionViewAction } from "@/features/training/rbt/actions";

describe("RBT training progress actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: "90000000-0000-4000-8000-000000000001",
      role: "member",
    });
  });

  it("derives identity on the server and records a viewed section through the controlled RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ completed_sections: [], last_section: "overview", completed_at: null }],
      error: null,
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await expect(recordRbtSectionViewAction("overview")).resolves.toEqual({
      completedAt: null,
      completedSections: [],
      lastSection: "overview",
    });
    expect(rpc).toHaveBeenCalledWith("record_training_progress", {
      mark_completed: false,
      target_section: "overview",
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
  });

  it("rejects invalid sections before loading a session or writing progress", async () => {
    await expect(markRbtSectionCompleteAction("invalid")).resolves.toEqual({
      completedAt: null,
      completedSections: [],
      lastSection: null,
    });
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });
});
