"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { createOnboardingSchema } from "@/lib/validation/onboarding";
import { getLocaleDashboardPath } from "@/lib/auth/redirects";
import { ONBOARDING_POLICY_VERSION } from "./policy";
import type { OnboardingActionState } from "./action-state";

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
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

  const firstName = typeof user.user_metadata.first_name === "string" ? user.user_metadata.first_name : "";
  const lastName = typeof user.user_metadata.last_name === "string" ? user.user_metadata.last_name : "";
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
