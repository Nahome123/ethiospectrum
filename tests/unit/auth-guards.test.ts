import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSupabaseClaims: vi.fn(),
  getCurrentUserRoleRecord: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentSupabaseClaims: mocks.getCurrentSupabaseClaims,
  getCurrentUserRoleRecord: mocks.getCurrentUserRoleRecord,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "es") }));

import { getAuthenticatedUser, requireRole, requireUser } from "@/lib/auth/guards";

const signedInAt = Date.parse("2026-10-01T12:00:00Z") / 1000;
const freshClaims = { sub: "synthetic-user", amr: [{ method: "password", timestamp: signedInAt }] };

describe("server-side authorization guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads a verified identity role from user_roles rather than user metadata", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue({
      ...freshClaims,
      app_metadata: { role: "administrator" },
      user_metadata: { role: "administrator" },
    });
    mocks.getCurrentUserRoleRecord.mockResolvedValue({ role: "member", grantedAt: "2026-09-01T00:00:00Z" });
    await expect(getAuthenticatedUser()).resolves.toEqual({ id: "synthetic-user", role: "member" });
    expect(mocks.getCurrentUserRoleRecord).toHaveBeenCalledWith("synthetic-user");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("ends a session that signed in before its role changed", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue(freshClaims);
    mocks.getCurrentUserRoleRecord.mockResolvedValue({
      role: "specialist",
      grantedAt: "2026-10-01T13:00:00Z",
    });
    await getAuthenticatedUser();
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/signout?reason=role-changed&locale=es");
  });

  it("redirects an unauthenticated member to the locale-specific login route", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue(null);
    await requireUser("am", "/am/documents");
    expect(mocks.redirect).toHaveBeenCalledWith("/am/login?next=%2Fam%2Fdocuments");
  });

  it("denies a normal authenticated user from administrator routes by default", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue({ sub: "synthetic-user", app_metadata: {} });
    mocks.getCurrentUserRoleRecord.mockResolvedValue({ role: "member", grantedAt: null });
    await requireRole("es", "/es/admin/users", "administrator");
    expect(mocks.redirect).toHaveBeenCalledWith("/es/auth-error?reason=access-denied");
  });

  it("admits an administrator wherever the specialist role is accepted", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue(freshClaims);
    mocks.getCurrentUserRoleRecord.mockResolvedValue({ role: "administrator", grantedAt: null });
    await expect(requireRole("en", "/en/specialist", ["specialist", "administrator"])).resolves.toEqual({
      id: "synthetic-user",
      role: "administrator",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("denies a missing role", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue(freshClaims);
    mocks.getCurrentUserRoleRecord.mockResolvedValue(null);
    await requireRole("en", "/en/specialist", ["specialist", "administrator"]);
    expect(mocks.redirect).toHaveBeenCalledWith("/en/auth-error?reason=access-denied");
  });
});
