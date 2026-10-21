"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import {
  createForgotPasswordSchema,
  createLoginSchema,
  createResetPasswordSchema,
  createSignupSchema,
} from "@/lib/validation/auth";
import { getLocaleDashboardPath, getSafeLocaleRedirect } from "./redirects";
import { clearPasswordRecoveryIntent, hasPasswordRecoveryIntent } from "./recovery";
import { getRoleHomePath } from "./role-session";
import { getSiteUrl } from "./site-url";
import type { AuthActionState } from "./action-state";
import { ONBOARDING_POLICY_VERSION } from "@/lib/onboarding/policy";

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

async function authTranslations(locale: AppLocale) {
  return getTranslations({ locale, namespace: "authentication" });
}

function confirmationUrl(next: string, flow?: "recovery"): string {
  const url = new URL("/auth/confirm", getSiteUrl());
  url.searchParams.set("next", next);
  if (flow) url.searchParams.set("flow", flow);
  return url.toString();
}

function isEmailRateLimitError(error: { status?: number; code?: string }): boolean {
  return (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
  );
}

function isEmailConfirmationRequiredError(error: { code?: string }): boolean {
  return error.code === "email_not_confirmed";
}

/** Maps the Supabase sign-up failures a person can act on to a message key. */
function signUpErrorKey(error: { status?: number; code?: string }): string {
  if (isEmailRateLimitError(error)) return "emailRateLimit";
  if (error.code === "user_already_exists" || error.code === "email_exists") return "accountExists";
  if (error.code === "weak_password") return "weakPassword";
  return "genericError";
}

export async function signUpAction(
  localeValue: string,
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isAppLocale(localeValue)) return { status: "error", message: "" };
  const t = await authTranslations(localeValue);
  const schema = createSignupSchema({
    email: t("emailError"),
    password: t("passwordError"),
    name: t("nameError"),
    passwordMatch: t("passwordMismatch"),
    terms: t("termsRequired"),
  });
  const parsed = schema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    termsAccepted: formData.get("termsAccepted") === "on",
  });
  if (!parsed.success)
    return { status: "error", message: t("validationError"), email: String(formData.get("email") ?? "") };

  // Every registration is a household owner whose household the database
  // creates automatically (PRD section 43).
  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        preferred_locale: localeValue,
        account_intent: "household_owner",
        terms_policy_version: ONBOARDING_POLICY_VERSION,
      },
      emailRedirectTo: confirmationUrl(getLocaleDashboardPath(localeValue)),
    },
  });
  if (error) {
    const key = signUpErrorKey(error);
    if (key === "genericError") {
      // Provider codes only; the address and password are never logged.
      console.error("Supabase sign-up failed", {
        status: error.status,
        code: error.code,
        message: error.message,
      });
    }
    return { status: "error", message: t(key), email: parsed.data.email };
  }
  // With email confirmation disabled, Supabase returns a live session: skip the
  // "check your email" screen and continue where the confirmation link would go.
  if (data?.session) {
    revalidatePath("/", "layout");
    redirect(getLocaleDashboardPath(localeValue));
  }
  redirect(`/${localeValue}/check-email`);
}

/**
 * The origin the person is browsing, so the Google round trip returns to the
 * same deployment (the sign-in cookie lives there). Supabase only redirects to
 * URLs on its allow list, so an unexpected host falls back to the Site URL.
 */
async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (host) {
    const protocol =
      requestHeaders.get("x-forwarded-proto") ??
      (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
    try {
      return new URL(`${protocol}://${host}`).origin;
    } catch {
      // Fall through to the configured site URL.
    }
  }
  return getSiteUrl();
}

/**
 * "Continue with Google": sends the person to Google through Supabase. New
 * accounts finish on the dashboard, where they name their household.
 */
export async function signInWithGoogleAction(localeValue: string, formData: FormData): Promise<void> {
  if (!isAppLocale(localeValue)) redirect("/en/login");
  const requested = String(formData.get("next") ?? "");
  const callback = new URL("/auth/confirm", await requestOrigin());
  callback.searchParams.set("flow", "oauth");
  if (requested) {
    callback.searchParams.set(
      "next",
      getSafeLocaleRedirect(requested, getLocaleDashboardPath(localeValue), localeValue),
    );
  } else {
    // No destination asked for: the callback sends staff to their workspace.
    callback.searchParams.set("next", getLocaleDashboardPath(localeValue));
    callback.searchParams.set("home", "1");
  }

  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString(), queryParams: { prompt: "select_account" } },
  });
  if (error || !data?.url) {
    console.error("Google sign-in could not start", { status: error?.status, code: error?.code });
    redirect(`/${localeValue}/auth-error?reason=oauth`);
  }
  redirect(data.url);
}

export async function signInAction(
  localeValue: string,
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isAppLocale(localeValue)) return { status: "error", message: "" };
  const t = await authTranslations(localeValue);
  const schema = createLoginSchema({ email: t("emailError"), password: t("passwordError") });
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success)
    return { status: "error", message: t("validationError"), email: String(formData.get("email") ?? "") };

  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (isEmailConfirmationRequiredError(error)) {
      return {
        status: "error",
        message: t("emailConfirmationRequired"),
        email: parsed.data.email,
        reason: "email_confirmation_required",
      };
    }
    return { status: "error", message: t("invalidCredentials"), email: parsed.data.email };
  }
  // Without an explicit destination, staff start in their own workspace.
  let home = getLocaleDashboardPath(localeValue);
  if (data?.user) {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();
    home = getRoleHomePath(localeValue, roleRow?.role ?? null);
  }
  const next = getSafeLocaleRedirect(String(formData.get("next") ?? ""), home, localeValue);
  revalidatePath("/", "layout");
  redirect(next);
}

export async function forgotPasswordAction(
  localeValue: string,
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isAppLocale(localeValue)) return { status: "error", message: "" };
  const t = await authTranslations(localeValue);
  const parsed = createForgotPasswordSchema({ email: t("emailError") }).safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) return { status: "error", message: t("validationError") };
  const supabase = await createServerActionSupabaseClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: confirmationUrl(`/${localeValue}/reset-password`, "recovery"),
  });
  return { status: "success", message: t("recoveryNeutralSuccess") };
}

export async function resendConfirmationAction(
  localeValue: string,
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isAppLocale(localeValue)) return { status: "error", message: "" };
  const t = await authTranslations(localeValue);
  const parsed = createForgotPasswordSchema({ email: t("emailError") }).safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) return { status: "error", message: t("validationError") };

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: confirmationUrl(getLocaleDashboardPath(localeValue)) },
  });
  if (error && isEmailRateLimitError(error)) {
    return { status: "error", message: t("emailRateLimit") };
  }
  return { status: "success", message: t("confirmationResendNeutralSuccess") };
}

export async function resetPasswordAction(
  localeValue: string,
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isAppLocale(localeValue)) return { status: "error", message: "" };
  const t = await authTranslations(localeValue);
  const parsed = createResetPasswordSchema({
    password: t("passwordError"),
    passwordMatch: t("passwordMismatch"),
  }).safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { status: "error", message: t("validationError") };
  if (!(await hasPasswordRecoveryIntent(localeValue))) {
    return { status: "error", message: t("sessionExpired") };
  }
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: t("sessionExpired") };
  await clearPasswordRecoveryIntent(localeValue);
  revalidatePath("/", "layout");
  return { status: "success", message: t("passwordUpdated") };
}

export async function signOutAction(localeValue: AppLocale): Promise<void> {
  const supabase = await createServerActionSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(`/${localeValue}/login`);
}
