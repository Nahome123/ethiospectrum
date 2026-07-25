"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { createOnboardingSchema } from "@/lib/validation/onboarding";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { getLocaleDashboardPath, getLocaleOnboardingPath } from "@/lib/auth/redirects";
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
    firstName: t("firstNameError"),
    lastName: t("lastNameError"),
    preferredLocale: t("preferredLocaleError"),
    timezone: t("timezoneError"),
  });
  const parsed = schema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    householdName: formData.get("householdName"),
    preferredLocale: formData.get("preferredLocale"),
    timezone: formData.get("timezone"),
    consentAccepted: formData.get("consentAccepted") === "on",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: t("validationError"),
      householdName: String(formData.get("householdName") ?? ""),
    };
  }

  if (!(await getAuthenticatedUser())) {
    return { status: "error", message: t("genericError"), householdName: parsed.data.householdName };
  }

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("complete_household_onboarding", {
    raw_first_name: parsed.data.firstName,
    raw_last_name: parsed.data.lastName,
    raw_name: parsed.data.householdName,
    raw_policy_version: ONBOARDING_POLICY_VERSION,
    raw_preferred_locale: parsed.data.preferredLocale,
    raw_timezone: parsed.data.timezone,
  });
  if (error) {
    return { status: "error", message: t("genericError"), householdName: parsed.data.householdName };
  }
  revalidatePath("/", "layout");
  revalidatePath(getLocaleDashboardPath(localeValue));
  revalidatePath(getLocaleOnboardingPath(localeValue));
  revalidatePath(`/${localeValue}/dependents`);
  revalidatePath(`/${localeValue}/documents`);
  redirect(getLocaleDashboardPath(localeValue));
}
