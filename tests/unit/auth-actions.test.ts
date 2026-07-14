import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      resend: mocks.resend,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      updateUser: mocks.updateUser,
    },
  })),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  forgotPasswordAction,
  resendConfirmationAction,
  signInAction,
  signUpAction,
} from "@/lib/auth/actions";

const idle = { status: "idle" } as const;

function formData(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("authentication actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.signUp.mockResolvedValue({ error: null });
    mocks.resend.mockResolvedValue({ error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: new Error("not disclosed") });
  });

  it("redirects successful sign-in to a validated locale path", async () => {
    await signInAction(
      "en",
      idle,
      formData({ email: "member@example.test", password: "long-enough", next: "/en/documents" }),
    );
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "member@example.test",
      password: "long-enough",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/en/documents");
  });

  it("returns a safe localized error for failed sign-in", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error("private provider detail") });
    await expect(
      signInAction("en", idle, formData({ email: "member@example.test", password: "long-enough" })),
    ).resolves.toEqual({
      status: "error",
      message: "invalidCredentials",
      email: "member@example.test",
    });
  });

  it("preserves locale in the sign-up confirmation destination", async () => {
    await signUpAction(
      "am",
      idle,
      formData({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "member@example.test",
        password: "long-enough",
        confirmPassword: "long-enough",
        termsAccepted: "on",
      }),
    );
    expect(mocks.signUp.mock.calls[0][0].options.emailRedirectTo).toContain("next=%2Fam%2Fdashboard");
  });

  it("returns a safe rate-limit message for throttled confirmation emails", async () => {
    mocks.signUp.mockResolvedValue({ error: { status: 429, code: "over_email_send_rate_limit" } });
    await expect(
      signUpAction(
        "en",
        idle,
        formData({
          firstName: "Ada",
          lastName: "Lovelace",
          email: "member@example.test",
          password: "long-enough",
          confirmPassword: "long-enough",
          termsAccepted: "on",
        }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "emailRateLimit",
      email: "member@example.test",
    });
  });

  it("returns a neutral response for password recovery", async () => {
    await expect(
      forgotPasswordAction("es", idle, formData({ email: "member@example.test" })),
    ).resolves.toEqual({
      status: "success",
      message: "recoveryNeutralSuccess",
    });
  });

  it("resends confirmation through the locale-specific callback without disclosing account status", async () => {
    await expect(
      resendConfirmationAction("es", idle, formData({ email: "member@example.test" })),
    ).resolves.toEqual({
      status: "success",
      message: "confirmationResendNeutralSuccess",
    });
    expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "member@example.test",
      options: expect.objectContaining({
        emailRedirectTo: expect.stringContaining("next=%2Fes%2Fdashboard"),
      }),
    });
  });
});
