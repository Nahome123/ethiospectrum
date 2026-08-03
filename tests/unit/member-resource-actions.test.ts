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

import { addResourceToRoadmapAction, updateResourceBookmarkAction } from "@/lib/resources/member-actions";

const idle = { status: "idle" } as const;
const slug = "school-meeting-guide";

function bookmarkForm(bookmarked: "true" | "false") {
  const form = new FormData();
  form.set("bookmarked", bookmarked);
  form.set("slug", "forged-browser-slug");
  form.set("userId", "forged-browser-user");
  return form;
}

describe("member resource actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
  });

  it.each(["true", "false"] as const)(
    "sets bookmark intent through the controlled RPC for %s",
    async (intent) => {
      const rpc = vi.fn().mockResolvedValue({ data: intent === "true", error: null });
      mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

      await expect(updateResourceBookmarkAction("es", slug, idle, bookmarkForm(intent))).resolves.toEqual({
        status: "success",
        message: intent === "true" ? "bookmarkSaved" : "bookmarkRemoved",
        bookmarked: intent === "true",
      });
      expect(rpc).toHaveBeenCalledWith("set_resource_bookmark", {
        input_slug: slug,
        input_bookmarked: intent === "true",
      });
      expect(JSON.stringify(rpc.mock.calls)).not.toContain("forged-browser");
      expect(mocks.revalidatePath.mock.calls).toEqual([
        ["/es/member/resources"],
        [`/es/member/resources/${slug}`],
      ]);
    },
  );

  it("adds a localized resource to the current household roadmap using only server-controlled identity", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ item_id: "item-id", already_exists: false }],
      error: null,
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const form = new FormData();
    form.set("householdId", "forged-household");
    form.set("title", "forged title");

    await expect(addResourceToRoadmapAction("am", slug, idle, form)).resolves.toEqual({
      status: "success",
      message: "addedToRoadmap",
      onRoadmap: true,
    });
    expect(rpc).toHaveBeenCalledWith("add_resource_to_roadmap", {
      input_slug: slug,
      input_locale: "am",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("forged");
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/am/member/resources"],
      [`/am/member/resources/${slug}`],
      ["/am/roadmap"],
      ["/am/dashboard"],
    ]);
  });

  it("reports idempotent roadmap links without creating browser-controlled duplicates", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ item_id: "item-id", already_exists: true }],
      error: null,
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await expect(addResourceToRoadmapAction("en", slug, idle, new FormData())).resolves.toMatchObject({
      status: "success",
      message: "alreadyOnRoadmap",
      onRoadmap: true,
    });
  });

  it.each([
    ["invalid locale", () => updateResourceBookmarkAction("fr", slug, idle, bookmarkForm("true"))],
    ["invalid slug", () => addResourceToRoadmapAction("en", "../unsafe", idle, new FormData())],
  ])("rejects %s before database access", async (_label, action) => {
    await expect(action()).resolves.toMatchObject({ status: "error" });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sanitizes database failures and does not revalidate", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "private household UUID and internal SQL" },
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const result = await addResourceToRoadmapAction("en", slug, idle, new FormData());
    expect(result).toEqual({ status: "error", message: "roadmapError" });
    expect(JSON.stringify(result)).not.toContain("household UUID");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
