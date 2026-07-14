import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/route-handler", () => ({
  createRouteHandlerSupabaseClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      verifyOtp: mocks.verifyOtp,
    },
  })),
}));

import { GET } from "@/app/auth/confirm/route";

describe("authentication confirmation callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges a valid PKCE code and preserves the approved locale destination", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      new NextRequest("http://localhost/auth/confirm?code=valid-code&next=/am/dashboard"),
    );
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(response.headers.get("location")).toBe("http://localhost/am/dashboard");
  });

  it("marks a successful recovery callback with a short-lived recovery cookie", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(
      new NextRequest(
        "http://localhost/auth/confirm?token_hash=valid-token&type=recovery&next=/es/reset-password",
      ),
    );
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "valid-token", type: "recovery" });
    expect(response.headers.get("location")).toBe("http://localhost/es/reset-password");
    expect(response.headers.get("set-cookie")).toContain("ethiospectrum-password-recovery=es");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rejects incomplete confirmation parameters without invoking Supabase", async () => {
    const response = await GET(new NextRequest("http://localhost/auth/confirm?next=/am/dashboard"));
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("http://localhost/am/auth-error?reason=invalid");
  });
});
