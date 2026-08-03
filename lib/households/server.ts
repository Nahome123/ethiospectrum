import "server-only";

import {
  createServerComponentSupabaseClient,
  getCurrentHousehold,
  getCurrentSupabaseClaims,
} from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type HouseholdPermission = Database["public"]["Enums"]["household_permission"];

export type HouseholdContext = {
  household: { id: string; name: string };
  permission: HouseholdPermission | null;
  canManage: boolean;
};

export async function getCurrentHouseholdContext(): Promise<HouseholdContext | null> {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const claims = await getCurrentSupabaseClaims();
  if (!claims || typeof claims.sub !== "string") {
    return { household, permission: null, canManage: false };
  }

  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("household_members")
    .select("permission")
    .eq("household_id", household.id)
    .eq("user_id", claims.sub)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return { household, permission: null, canManage: false };

  return {
    household,
    permission: data.permission,
    canManage: data.permission === "owner" || data.permission === "administrator",
  };
}
