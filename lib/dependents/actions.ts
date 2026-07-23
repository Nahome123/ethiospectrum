"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { createDependentSchema } from "@/lib/validation/dependent";
import type { DependentActionState } from "./action-state";
import { getActiveDependent, getDependentContext } from "./server";

function input(formData: FormData) {
  return {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    preferredName: String(formData.get("preferredName") ?? ""),
    birthYear: String(formData.get("birthYear") ?? ""),
    schoolDistrict: String(formData.get("schoolDistrict") ?? ""),
    gradeLevel: String(formData.get("gradeLevel") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}
async function parsed(locale: AppLocale, formData: FormData) {
  const t = await getTranslations({ locale, namespace: "dependents" });
  return {
    t,
    result: createDependentSchema({
      firstName: t("firstNameError"),
      birthYear: t("birthYearError"),
      text: t("textError"),
    }).safeParse(input(formData)),
  };
}
export async function createDependentAction(
  locale: AppLocale,
  _state: DependentActionState,
  formData: FormData,
): Promise<DependentActionState> {
  const { t, result } = await parsed(locale, formData);
  const context = await getDependentContext();
  if (!result.success) return { status: "error", message: t("validationError") };
  if (!context?.canManage) return { status: "error", message: t("accessDenied") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.from("dependents").insert({
    household_id: context.household.id,
    created_by: context.userId,
    first_name: result.data.firstName,
    last_name: result.data.lastName,
    preferred_name: result.data.preferredName,
    birth_year: result.data.birthYear,
    school_district: result.data.schoolDistrict,
    grade_level: result.data.gradeLevel,
    notes: result.data.notes,
  });
  if (error) return { status: "error", message: t("saveError") };
  revalidatePath(`/${locale}/dependents`);
  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/dependents`);
}
export async function updateDependentAction(
  locale: AppLocale,
  dependentId: string,
  _state: DependentActionState,
  formData: FormData,
): Promise<DependentActionState> {
  const { t, result } = await parsed(locale, formData);
  const record = await getActiveDependent(dependentId);
  if (!result.success) return { status: "error", message: t("validationError") };
  if (!record?.context.canManage) return { status: "error", message: t("accessDenied") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase
    .from("dependents")
    .update({
      first_name: result.data.firstName,
      last_name: result.data.lastName,
      preferred_name: result.data.preferredName,
      birth_year: result.data.birthYear,
      school_district: result.data.schoolDistrict,
      grade_level: result.data.gradeLevel,
      notes: result.data.notes,
    })
    .eq("id", dependentId)
    .eq("household_id", record.context.household.id);
  if (error) return { status: "error", message: t("saveError") };
  revalidatePath(`/${locale}/dependents`);
  revalidatePath(`/${locale}/dependents/${dependentId}`);
  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/dependents/${dependentId}`);
}
export async function archiveDependentAction(
  locale: AppLocale,
  dependentId: string,
  _state: DependentActionState,
): Promise<DependentActionState> {
  void _state;
  const t = await getTranslations({ locale, namespace: "dependents" });
  const record = await getActiveDependent(dependentId);
  if (!record?.context.canManage) return { status: "error", message: t("accessDenied") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase
    .from("dependents")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", dependentId)
    .eq("household_id", record.context.household.id);
  if (error) return { status: "error", message: t("archiveError") };
  revalidatePath(`/${locale}/dependents`);
  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/dependents`);
}
