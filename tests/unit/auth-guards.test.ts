import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSupabaseClaims: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getCurrentSupabaseClaims: mocks.getCurrentSupabaseClaims }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { getAuthenticatedUser, requireRole, requireUser } from "@/lib/auth/guards";

describe("server-side authorization guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a verified authenticated claim without trusting user metadata", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue({ sub: "synthetic-user", app_metadata: {} });
    await expect(getAuthenticatedUser()).resolves.toEqual({ id: "synthetic-user", role: null });
  });

  it("redirects an unauthenticated member to the locale-specific login route", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue(null);
    await requireUser("am", "/am/documents");
    expect(mocks.redirect).toHaveBeenCalledWith("/am/login?next=%2Fam%2Fdocuments");
  });

  it("denies a normal authenticated user from administrator routes by default", async () => {
    mocks.getCurrentSupabaseClaims.mockResolvedValue({ sub: "synthetic-user", app_metadata: {} });
    await requireRole("es", "/es/admin/users", "administrator");
    expect(mocks.redirect).toHaveBeenCalledWith("/es/auth-error?reason=access-denied");
  });
});
