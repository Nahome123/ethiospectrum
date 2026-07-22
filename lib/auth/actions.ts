"use server";

import { revalidatePath } from "next/cache";
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
import { getSiteUrl } from "./site-url";
import type { AuthActionState } from "./action-state";

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

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        preferred_locale: localeValue,
      },
      emailRedirectTo: confirmationUrl(getLocaleDashboardPath(localeValue)),
    },
  });
  if (error) {
    return {
      status: "error",
      message: isEmailRateLimitError(error) ? t("emailRateLimit") : t("genericError"),
      email: parsed.data.email,
    };
  }
  redirect(`/${localeValue}/check-email`);
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
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
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
  const next = getSafeLocaleRedirect(
    String(formData.get("next") ?? ""),
    getLocaleDashboardPath(localeValue),
    localeValue,
  );
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
