import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  roleRow: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({ auth: { signInWithOAuth: mocks.signInWithOAuth } })),
}));
vi.mock("@/lib/supabase/route-handler", () => ({
  createRouteHandlerSupabaseClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: mocks.exchangeCodeForSession, verifyOtp: mocks.verifyOtp },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.roleRow }) }) }),
  })),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { GET } from "@/app/auth/confirm/route";
import { signInWithGoogleAction } from "@/lib/auth/actions";

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

async function startGoogle(values: Record<string, string> = {}) {
  await expect(signInWithGoogleAction("am", form(values))).rejects.toThrow(/REDIRECT:/);
  return new URL(mocks.signInWithOAuth.mock.calls[0][0].options.redirectTo);
}

describe("Continue with Google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(
      new Headers({ host: "preview-123.vercel.app", "x-forwarded-proto": "https" }),
    );
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: "https://project.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
  });

  it("sends the person to Google and back to the deployment they are on", async () => {
    const callback = await startGoogle();
    expect(mocks.signInWithOAuth.mock.calls[0][0].provider).toBe("google");
    expect(callback.origin).toBe("https://preview-123.vercel.app");
    expect(callback.pathname).toBe("/auth/confirm");
    expect(callback.searchParams.get("flow")).toBe("oauth");
    expect(callback.searchParams.get("next")).toBe("/am/dashboard");
    expect(callback.searchParams.get("home")).toBe("1");
    expect(mocks.redirect).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/authorize?provider=google",
    );
  });

  it("ignores an old invitation token and goes to the dashboard", async () => {
    const callback = await startGoogle({ invitation: "a".repeat(64) });
    expect(callback.searchParams.get("next")).toBe("/am/dashboard");
    expect(callback.searchParams.get("home")).toBe("1");
  });

  it("keeps a safe requested destination and drops an unsafe one", async () => {
    expect((await startGoogle({ next: "/am/billing" })).searchParams.get("next")).toBe("/am/billing");
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ host: "localhost:3000" }));
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: "https://x" }, error: null });
    const callback = await startGoogle({ next: "https://evil.example/steal" });
    expect(callback.origin).toBe("http://localhost:3000");
    expect(callback.searchParams.get("next")).toBe("/am/dashboard");
  });

  it("shows the Google error page when sign-in cannot start", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { status: 400, code: "x" } });
    await expect(signInWithGoogleAction("am", form())).rejects.toThrow(
      "REDIRECT:/am/auth-error?reason=oauth",
    );
  });
});

describe("Google callback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends staff to their own workspace when no destination was asked for", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.roleRow.mockResolvedValue({ data: { role: "administrator" } });
    const response = await GET(
      new NextRequest("http://localhost/auth/confirm?code=abc&flow=oauth&next=/es/dashboard&home=1"),
    );
    expect(response.headers.get("location")).toBe("http://localhost/es/admin");
  });

  it("sends a family to the dashboard, where a new account sets up its household", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "u2" } }, error: null });
    mocks.roleRow.mockResolvedValue({ data: { role: "member" } });
    const response = await GET(
      new NextRequest("http://localhost/auth/confirm?code=abc&flow=oauth&next=/en/dashboard&home=1"),
    );
    expect(response.headers.get("location")).toBe("http://localhost/en/dashboard");
  });

  it("explains a cancelled or failed Google sign-in", async () => {
    const cancelled = await GET(
      new NextRequest("http://localhost/auth/confirm?flow=oauth&next=/am/dashboard&error=access_denied"),
    );
    expect(cancelled.headers.get("location")).toBe("http://localhost/am/auth-error?reason=oauth");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();

    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    const failed = await GET(
      new NextRequest("http://localhost/auth/confirm?code=x&flow=oauth&next=/am/dashboard"),
    );
    expect(failed.headers.get("location")).toBe("http://localhost/am/auth-error?reason=oauth");
  });
});
