import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSupabaseClaims: vi.fn(),
  getCurrentUserRole: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentSupabaseClaims: mocks.getCurrentSupabaseClaims,
  getCurrentUserRole: mocks.getCurrentUserRole,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { getAuthenticatedUser, requireRole, requireUser } from "@/lib/auth/guards";

describe("server-side authorization guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads a verified identity role from user_roles rather than user metadata", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue({
      sub: "synthetic-user",
      app_metadata: { role: "administrator" },
      user_metadata: { role: "administrator" },
    });
    mocks.getCurrentUserRole.mockResolvedValue("member");
    await expect(getAuthenticatedUser()).resolves.toEqual({ id: "synthetic-user", role: "member" });
    expect(mocks.getCurrentUserRole).toHaveBeenCalledWith("synthetic-user");
  });

  it("redirects an unauthenticated member to the locale-specific login route", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue(null);
    await requireUser("am", "/am/documents");
    expect(mocks.redirect).toHaveBeenCalledWith("/am/login?next=%2Fam%2Fdocuments");
  });

  it("denies a normal authenticated user from administrator routes by default", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue({ sub: "synthetic-user", app_metadata: {} });
    mocks.getCurrentUserRole.mockResolvedValue("member");
    await requireRole("es", "/es/admin/users", "administrator");
    expect(mocks.redirect).toHaveBeenCalledWith("/es/auth-error?reason=access-denied");
  });
});
