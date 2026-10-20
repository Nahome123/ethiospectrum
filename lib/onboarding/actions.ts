"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { createHouseholdNameSchema, createOnboardingSchema } from "@/lib/validation/onboarding";
import { getLocaleDashboardPath } from "@/lib/auth/redirects";
import { getCurrentHouseholdContext } from "@/lib/households/server";
import { ONBOARDING_POLICY_VERSION } from "./policy";
import type { OnboardingActionState } from "./action-state";

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

/**
 * First and last name from sign-up details, or from Google's profile
 * (given_name / family_name, else the full name split at the first space).
 */
function profileNames(metadata: Record<string, unknown>): { firstName: string; lastName: string } {
  const text = (key: string) => (typeof metadata[key] === "string" ? (metadata[key] as string).trim() : "");
  if (text("first_name")) return { firstName: text("first_name"), lastName: text("last_name") };
  if (text("given_name")) return { firstName: text("given_name"), lastName: text("family_name") };
  const full = text("full_name") || text("name");
  const [first = "", ...rest] = full.split(/\s+/);
  return { firstName: first.slice(0, 80), lastName: rest.join(" ").slice(0, 80) };
}

export async function completeOnboardingAction(
  localeValue: string,
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  if (!isAppLocale(localeValue)) return { status: "error", message: "" };
  const t = await getTranslations({ locale: localeValue, namespace: "onboarding" });
  const schema = createOnboardingSchema({
    householdName: t("householdNameError"),
    consent: t("consentError"),
  });
  const parsed = schema.safeParse({
    householdName: formData.get("householdName"),
    consentAccepted: formData.get("consentAccepted") === "on",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: t("validationError"),
      householdName: String(formData.get("householdName") ?? ""),
    };
  }

  const supabase = await createServerActionSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: "error", message: t("genericError"), householdName: parsed.data.householdName };
  }

  const { firstName, lastName } = profileNames(user.user_metadata);
  const preferredLocale =
    typeof user.user_metadata.preferred_locale === "string"
      ? user.user_metadata.preferred_locale
      : localeValue;

  const { error } = await supabase.rpc("complete_household_onboarding", {
    raw_first_name: firstName,
    raw_last_name: lastName,
    raw_name: parsed.data.householdName,
    raw_policy_version: ONBOARDING_POLICY_VERSION,
    raw_preferred_locale: preferredLocale,
    raw_timezone: "UTC",
  });
  if (error) {
    return { status: "error", message: t("genericError"), householdName: parsed.data.householdName };
  }
  revalidatePath("/", "layout");
  redirect(getLocaleDashboardPath(localeValue));
}

export async function updateHouseholdAction(
  localeValue: string,
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  if (!isAppLocale(localeValue)) return { status: "error", message: "" };
  const t = await getTranslations({ locale: localeValue, namespace: "onboarding" });
  const parsed = createHouseholdNameSchema(t("householdNameError")).safeParse({
    householdName: formData.get("householdName"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: t("validationError"),
      householdName: String(formData.get("householdName") ?? ""),
    };
  }

  const context = await getCurrentHouseholdContext();
  if (!context?.canManage) {
    return {
      status: "error",
      message: t("updateAccessDenied"),
      householdName: parsed.data.householdName,
    };
  }

  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase
    .from("households")
    .update({ name: parsed.data.householdName })
    .eq("id", context.household.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return {
      status: "error",
      message: t("updateError"),
      householdName: parsed.data.householdName,
    };
  }

  revalidatePath("/", "layout");
  revalidatePath(`/${localeValue}/dashboard`);
  redirect(`/${localeValue}/dashboard`);
}
