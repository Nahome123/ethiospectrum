import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerActionSupabaseClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getTranslations: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: mocks.createServerActionSupabaseClient,
}));
vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { updateResourceDiscoveryMetadata } from "@/lib/resources/actions";
import { memberResourceQuerySchema, resourceDiscoveryMetadataSchema } from "@/lib/validation/resources";

const resourceId = "10000000-0000-4000-8000-000000000001";
const idle = { status: "idle" } as const;

function discoveryForm(type = "video", rank = " 12 ") {
  const form = new FormData();
  form.set("expectedVersion", "7");
  form.set("resourceType", type);
  form.set("featuredRank", rank);
  form.set("status", "published");
  form.set("actorUserId", "browser-actor");
  return form;
}

describe("resource discovery validation", () => {
  it("normalizes bounded catalog filters and ignores invalid enum values", () => {
    expect(
      memberResourceQuerySchema.parse({
        q: "  school meeting  ",
        category: "not-a-topic",
        type: "video",
        bookmarked: "1",
        assigned: "1",
        featured: "0",
        catalog: "1",
        page: "3",
      }),
    ).toEqual({
      q: "school meeting",
      category: undefined,
      type: "video",
      bookmarked: true,
      assigned: true,
      featured: false,
      catalog: true,
      page: 3,
    });
  });

  it("bounds search, pagination, discovery types, and featured positions", () => {
    expect(memberResourceQuerySchema.parse({ q: "x".repeat(101), page: "-2" })).toMatchObject({
      q: "",
      page: 1,
    });
    expect(
      resourceDiscoveryMetadataSchema.safeParse({
        resourceId,
        expectedVersion: 1,
        resourceType: "audio",
        featuredRank: "1",
      }).success,
    ).toBe(false);
    expect(
      resourceDiscoveryMetadataSchema.safeParse({
        resourceId,
        expectedVersion: 1,
        resourceType: "article",
        featuredRank: "1001",
      }).success,
    ).toBe(false);
  });
});

describe("resource discovery administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "admin", role: "administrator" });
  });

  it("updates only controlled discovery metadata and refreshes member routes", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ resource_version: 8 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await expect(updateResourceDiscoveryMetadata("es", resourceId, idle, discoveryForm())).resolves.toEqual({
      status: "success",
      message: "saved",
    });
    expect(rpc).toHaveBeenCalledWith("update_resource_discovery_metadata", {
      target_resource_id: resourceId,
      expected_version: 7,
      input_resource_type: "video",
      input_featured_rank: 12,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("browser-actor");
    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toContain("/en/member/resources");
    expect(paths).toContain("/am/member/resources/[slug]");
    expect(paths).toContain(`/es/admin/resources/${resourceId}`);
  });

  it("sends an omitted rank as the controlled null default", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ resource_version: 8 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    await updateResourceDiscoveryMetadata("en", resourceId, idle, discoveryForm("guide", ""));
    expect(rpc).toHaveBeenCalledWith(
      "update_resource_discovery_metadata",
      expect.objectContaining({ input_resource_type: "guide", input_featured_rank: undefined }),
    );
  });

  it.each([
    ["member", { id: "member", role: "member" }],
    ["content editor", { id: "editor", role: "content_editor" }],
    ["anonymous user", null],
  ])("denies %s before database access", async (_label, actor) => {
    mocks.getAuthenticatedUser.mockResolvedValue(actor);
    await expect(updateResourceDiscoveryMetadata("en", resourceId, idle, discoveryForm())).resolves.toEqual({
      status: "error",
      message: "validationError",
    });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("maps stale conflicts and does not expose database messages", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "40001", message: "private resource UUID" },
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
    const result = await updateResourceDiscoveryMetadata("en", resourceId, idle, discoveryForm());
    expect(result).toEqual({ status: "error", message: "staleError" });
    expect(JSON.stringify(result)).not.toContain("private resource");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
