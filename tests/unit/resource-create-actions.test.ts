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

import { createResource } from "@/lib/resources/actions";

const idle = { status: "idle" } as const;
const resourceId = "10000000-0000-4000-8000-000000000001";
const memberId = "20000000-0000-4000-8000-000000000001";

function createForm(accountIds: string[] = []) {
  const form = new FormData();
  form.set("slug", "school-meeting-guide");
  form.set("category", "education");
  form.set("title", "Preparing for a school meeting");
  form.set("summary", "A practical guide for preparing useful questions before a school meeting.");
  form.set(
    "body",
    "This is a sufficiently long canonical English resource body that is safe to submit for review.",
  );
  form.set("idempotencyKey", "30000000-0000-4000-8000-000000000001");
  accountIds.forEach((accountId) => form.append("accountIds", accountId));
  return form;
}

describe("resource creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "admin-id", role: "administrator" });
  });

  it("creates a general-library draft without requiring a For You member selection", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ resource_id: resourceId, resource_version: 1 }],
      error: null,
    });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await createResource("en", idle, createForm());

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_resource_draft", {
      input_body:
        "This is a sufficiently long canonical English resource body that is safe to submit for review.",
      input_category: "education",
      input_idempotency_key: "30000000-0000-4000-8000-000000000001",
      input_slug: "school-meeting-guide",
      input_summary: "A practical guide for preparing useful questions before a school meeting.",
      input_title: "Preparing for a school meeting",
    });
    expect(mocks.redirect).toHaveBeenCalledWith(`/en/admin/resources/${resourceId}`);
  });

  it("adds For You access only when an administrator checks a member", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ resource_id: resourceId, resource_version: 1 }], error: null })
      .mockResolvedValueOnce({ data: [{ resource_id: resourceId, resource_version: 2 }], error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await createResource("en", idle, createForm([memberId]));

    expect(rpc).toHaveBeenLastCalledWith("set_resource_account_access", {
      expected_version: 1,
      input_user_ids: [memberId],
      target_resource_id: resourceId,
    });
  });
});
