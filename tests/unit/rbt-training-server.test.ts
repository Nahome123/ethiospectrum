import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerComponentSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerComponentSupabaseClient: mocks.createServerComponentSupabaseClient,
}));

import { getCurrentRbtTrainingProgress } from "@/features/training/rbt/server";

function progressClient(data: unknown, error: { code: string } | null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data, error });
  return { from: vi.fn().mockReturnValue(query), query };
}

describe("RBT training progress server query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads only the current user's progress for the fixed course", async () => {
    const fixture = progressClient(
      { completed_sections: ["overview"], last_section: "overview", completed_at: null },
      null,
    );
    mocks.createServerComponentSupabaseClient.mockResolvedValue(fixture);

    await expect(
      getCurrentRbtTrainingProgress("90000000-0000-4000-8000-000000000001"),
    ).resolves.toEqual({
      completedAt: null,
      completedSections: ["overview"],
      lastSection: "overview",
    });
    expect(fixture.from).toHaveBeenCalledWith("training_progress");
    expect(fixture.query.select).toHaveBeenCalledWith("completed_sections, last_section, completed_at");
    expect(fixture.query.eq).toHaveBeenCalledWith("user_id", "90000000-0000-4000-8000-000000000001");
  });

  it("keeps the lesson accessible while a deployment has not applied the progress schema", async () => {
    const fixture = progressClient(null, { code: "PGRST205" });
    mocks.createServerComponentSupabaseClient.mockResolvedValue(fixture);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      getCurrentRbtTrainingProgress("90000000-0000-4000-8000-000000000001"),
    ).resolves.toEqual({
      completedAt: null,
      completedSections: [],
      lastSection: null,
    });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("PGRST205"));
  });

  it("fails closed for unexpected database errors", async () => {
    const fixture = progressClient(null, { code: "42501" });
    mocks.createServerComponentSupabaseClient.mockResolvedValue(fixture);

    await expect(
      getCurrentRbtTrainingProgress("90000000-0000-4000-8000-000000000001"),
    ).rejects.toThrow("Unable to load training progress.");
  });
});
