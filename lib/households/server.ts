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

export type HouseholdPermissionKey =
  | "submit_requests"
  | "confirm_appointments"
  | "make_payments"
  | "access_training"
  | "upload_documents"
  | "manage_subscription";

export type HouseholdAccess = {
  household: { id: string; name: string };
  permission: HouseholdPermission;
  isOwner: boolean;
  /** Effective launch permissions: every permission for the owner, granted ones for the caregiver. */
  permissions: HouseholdPermissionKey[];
};

/** The launch authorization projection; the database re-checks every mutation. */
export async function getHouseholdAccess(): Promise<HouseholdAccess | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_current_household_access");
  const row = data?.[0];
  if (error || !row) return null;
  return {
    household: { id: row.household_id, name: row.household_name },
    permission: row.permission,
    isOwner: row.is_owner,
    permissions: (row.caregiver_permissions ?? []) as HouseholdPermissionKey[],
  };
}

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
