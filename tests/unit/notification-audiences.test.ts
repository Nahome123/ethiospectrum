import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { markNotificationsReadAction } from "@/lib/notifications/actions";
import { isNotificationAudience, notificationsPath } from "@/lib/notifications/audience";

describe("notification audiences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
  });

  it("gives each workspace its own notifications page", () => {
    expect(notificationsPath("family")).toBe("/notifications");
    expect(notificationsPath("specialist")).toBe("/specialist/notifications");
    expect(notificationsPath("admin")).toBe("/admin/notifications");
  });

  it("accepts only known audiences", () => {
    expect(isNotificationAudience("specialist")).toBe(true);
    expect(isNotificationAudience("everyone")).toBe(false);
  });

  it("marks all read only within the current workspace", async () => {
    await markNotificationsReadAction("en", "specialist", new FormData());
    expect(mocks.rpc).toHaveBeenCalledWith("mark_notifications_read", {
      target_ids: undefined,
      input_audience: "specialist",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/specialist/notifications");
  });

  it("refuses an unknown audience before touching the database", async () => {
    await markNotificationsReadAction("en", "everyone" as never, new FormData());
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
