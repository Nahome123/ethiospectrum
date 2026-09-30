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

export class HouseholdAccessError extends Error {
  constructor(readonly code: string | undefined) {
    super(
      code === "PGRST202" || code === "42883"
        ? "get_current_household_access() does not exist in this database. Apply the 20260929* migrations."
        : `Household access could not be loaded (${code ?? "unknown error"}).`,
    );
    this.name = "HouseholdAccessError";
  }
}

const ALL_HOUSEHOLD_PERMISSIONS: HouseholdPermissionKey[] = [
  "submit_requests",
  "confirm_appointments",
  "make_payments",
  "access_training",
  "upload_documents",
  "manage_subscription",
];

/**
 * Reads the caller's membership directly through RLS. Used when the RPC is
 * unavailable (for example before the 20260929* migrations are applied). A
 * caregiver gets no launch permissions here because their grants live in a
 * column the older schema lacks; the database re-checks every mutation anyway.
 */
async function getHouseholdAccessFromTables(): Promise<HouseholdAccess | null> {
  const claims = await getCurrentSupabaseClaims();
  if (!claims || typeof claims.sub !== "string") return null;

  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("household_members")
    .select("permission, households!inner(id, name, deleted_at, created_at)")
    .eq("user_id", claims.sub)
    .eq("status", "active")
    .is("households.deleted_at", null)
    .order("created_at", { referencedTable: "households", ascending: true });
  if (error) {
    console.error("household membership fallback failed", { code: error.code, message: error.message });
    throw new HouseholdAccessError(error.code);
  }

  const row = data?.[0];
  if (!row) return null;
  const isOwner = row.permission === "owner";
  return {
    household: { id: row.households.id, name: row.households.name },
    permission: row.permission,
    isOwner,
    permissions: isOwner || row.permission === "administrator" ? ALL_HOUSEHOLD_PERMISSIONS : [],
  };
}

/**
 * The launch authorization projection; the database re-checks every mutation.
 * Returns null only when the caller genuinely has no active household. If the
 * RPC fails, the membership is read directly; if that fails too, this throws,
 * because treating an error as "no household" would offer onboarding and let
 * the user create a second household.
 */
export async function getHouseholdAccess(): Promise<HouseholdAccess | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_current_household_access");
  if (error) {
    // Codes and messages only; no identifiers or household data are logged.
    console.error("get_current_household_access failed; reading membership directly", {
      code: error.code,
      message: error.message,
    });
    return getHouseholdAccessFromTables();
  }
  const row = data?.[0];
  if (!row) return null;
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
