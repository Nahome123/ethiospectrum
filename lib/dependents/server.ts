import "server-only";
import {
  getCurrentSupabaseClaims,
  getCurrentHousehold,
  createServerComponentSupabaseClient,
} from "@/lib/supabase/server";

export async function getDependentContext() {
  const claims = await getCurrentSupabaseClaims();
  const household = await getCurrentHousehold();
  if (!claims || typeof claims.sub !== "string" || !household) return null;
  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("household_members")
    .select("permission")
    .eq("household_id", household.id)
    .eq("user_id", claims.sub)
    .eq("status", "active")
    .maybeSingle();
  return {
    household,
    userId: claims.sub,
    canManage: data?.permission === "owner" || data?.permission === "administrator",
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
