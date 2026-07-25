import "server-only";
import { getCurrentHouseholdContext, createServerComponentSupabaseClient } from "@/lib/supabase/server";

export async function getDependentContext() {
  const context = await getCurrentHouseholdContext();
  if (!context) return null;

  return {
    household: context.household,
    userId: context.userId,
    canManage: context.permission === "owner" || context.permission === "administrator",
  };
}

export async function getActiveDependent(dependentId: string) {
  const context = await getDependentContext();
  if (!context) return null;
  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("dependents")
    .select(
      "id, first_name, last_name, preferred_name, birth_year, school_district, grade_level, notes, created_at",
    )
    .eq("id", dependentId)
    .eq("household_id", context.household.id)
    .is("archived_at", null)
    .maybeSingle();
  return data ? { context, dependent: data } : null;
}
