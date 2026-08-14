import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCurrentHouseholdContext: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/auth/guards", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/households/server", () => ({
  getCurrentHouseholdContext: mocks.getCurrentHouseholdContext,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requireHouseholdBillingAccess } from "@/lib/billing/access";

const household = { id: "d2000000-0000-4000-8000-000000000001", name: "Synthetic household" };

describe("household billing route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves member access without adding a second role source", async () => {
    const user = { id: "member-user", role: "member" } as const;
    mocks.requireUser.mockResolvedValue(user);

    await expect(requireHouseholdBillingAccess("en", "/en/billing")).resolves.toBe(user);
    expect(mocks.getCurrentHouseholdContext).not.toHaveBeenCalled();
  });

  it("allows a platform administrator only when active household ownership is verified", async () => {
    const user = { id: "administrator-owner", role: "administrator" } as const;
    mocks.requireUser.mockResolvedValue(user);
    mocks.getCurrentHouseholdContext.mockResolvedValue({
      household,
      permission: "owner",
      canManage: true,
    });

    await expect(requireHouseholdBillingAccess("es", "/es/billing")).resolves.toBe(user);
  });

  it.each(["administrator", "member", "viewer", null])(
    "denies a platform administrator with household permission %s",
    async (permission) => {
      mocks.requireUser.mockResolvedValue({ id: "platform-administrator", role: "administrator" });
      mocks.getCurrentHouseholdContext.mockResolvedValue(
        permission === null ? null : { household, permission, canManage: permission === "administrator" },
      );

      await expect(requireHouseholdBillingAccess("am", "/am/billing")).rejects.toThrow(
        "redirect:/am/auth-error?reason=access-denied",
      );
    },
  );

  it.each(["specialist", "content_editor"] as const)(
    "denies a %s even if a household owner record is present",
    async (role) => {
      mocks.requireUser.mockResolvedValue({ id: `${role}-owner`, role });
      mocks.getCurrentHouseholdContext.mockResolvedValue({ household, permission: "owner", canManage: true });

      await expect(requireHouseholdBillingAccess("en", "/en/billing")).rejects.toThrow(
        "redirect:/en/auth-error?reason=access-denied",
      );
      expect(mocks.getCurrentHouseholdContext).not.toHaveBeenCalled();
    },
  );
});
