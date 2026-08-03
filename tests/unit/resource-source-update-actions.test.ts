import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerActionSupabaseClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getTranslations: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: mocks.createServerActionSupabaseClient,
}));
vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { updateResource } from "@/lib/resources/actions";

const resourceId = "10000000-0000-4000-8000-000000000001";
const idle = { status: "idle" } as const;

function updateForm(field?: "title" | "summary" | "body") {
  const form = new FormData();
  form.set("slug", "safe-resource");
  form.set("category", "education");
  form.set("title", field === "title" ? "Changed English title" : "Canonical English title");
  form.set(
    "summary",
    field === "summary"
      ? "A changed canonical English summary that remains valid."
      : "A canonical English summary that is sufficiently detailed.",
  );
  form.set(
    "body",
    field === "body"
      ? "This changed English body is deliberately long enough to remain valid for the resource update action."
      : "This canonical English body is deliberately long enough to remain valid for the resource update action.",
  );
  form.set("expectedVersion", "7");
  return form;
}

function rpcResult(error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error });
  mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
  return rpc;
}

describe("canonical English source update action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "editor", role: "administrator" });
  });

  it.each(["title", "summary", "body"] as const)(
    "uses the controlled transaction and refreshes every affected route for a %s change",
    async (field) => {
      const rpc = rpcResult();
      await updateResource("es", resourceId, idle, updateForm(field));
      expect(rpc).toHaveBeenCalledWith("update_resource_draft", {
        target_resource_id: resourceId,
        expected_version: 7,
        input_slug: "safe-resource",
        input_category: "education",
        input_title: field === "title" ? "Changed English title" : "Canonical English title",
        input_summary:
          field === "summary"
            ? "A changed canonical English summary that remains valid."
            : "A canonical English summary that is sufficiently detailed.",
        input_body:
          field === "body"
            ? "This changed English body is deliberately long enough to remain valid for the resource update action."
            : "This canonical English body is deliberately long enough to remain valid for the resource update action.",
      });
      const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
      expect(paths).toEqual([
        "/en/resources",
        "/en/resources/[slug]",
        "/am/resources",
        "/am/resources/[slug]",
        "/es/resources",
        "/es/resources/[slug]",
        "/es/admin/resources",
        `/es/admin/resources/${resourceId}`,
        `/es/admin/resources/${resourceId}/edit`,
        `/es/editor/resources/${resourceId}/translations`,
        `/es/editor/resources/${resourceId}/translations/am`,
        `/es/editor/resources/${resourceId}/translations/am/edit`,
        `/es/editor/resources/${resourceId}/translations/am/review`,
        `/es/editor/resources/${resourceId}/translations/es`,
        `/es/editor/resources/${resourceId}/translations/es/edit`,
        `/es/editor/resources/${resourceId}/translations/es/review`,
      ]);
      expect(paths.join(" ")).not.toContain("household");
      expect(paths.every((path) => !path.includes("/es/es/"))).toBe(true);
    },
  );

  it("rejects an invalid resource identifier before database access or revalidation", async () => {
    await expect(updateResource("en", "unsafe/id", idle, updateForm())).resolves.toEqual({
      status: "error",
      message: "validationError",
    });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "40001", message: "Resource is stale; internal UUID 123" }, "staleError"],
    [{ code: "XX000", message: "private.invalidate_resource_translations failed" }, "saveError"],
  ])("does not report success or expose transaction errors", async (error, message) => {
    rpcResult(error);
    const result = await updateResource("en", resourceId, idle, updateForm("title"));
    expect(result).toEqual({ status: "error", message });
    expect(JSON.stringify(result)).not.toContain(error.message);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
