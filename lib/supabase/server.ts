import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireServerSupabaseEnv } from "@/lib/env/server";
import type { Database, HouseholdSummary, MemberProfile, SupabaseRole, User } from "./types";

type HouseholdPermission = Database["public"]["Enums"]["household_permission"];
type ActiveHouseholdRow = Pick<
  Database["public"]["Tables"]["households"]["Row"],
  "id" | "name" | "deleted_at"
>;
type ActiveHouseholdMembership = {
  household: ActiveHouseholdRow | null;
  permission: HouseholdPermission;
};

export type CurrentHouseholdContext = {
  household: HouseholdSummary;
  permission: HouseholdPermission;
  userId: string;
};

/**
 * Creates a request-scoped client for Server Components.
 * Server Components cannot write cookies; session refresh belongs in middleware or a mutable request boundary.
 */
export async function createServerComponentSupabaseClient() {
  const env = requireServerSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => undefined,
    },
  });
}

/** Verifies the current identity from JWT claims; use this for all authorization decisions. */
export async function getCurrentSupabaseClaims() {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    return null;
  }
  return data?.claims ?? null;
}

/** Fetches the current user only when current display data is actually required. */
export async function getCurrentSupabaseUser(): Promise<User | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error("Unable to verify the current Supabase user.");
  }
  return data.user;
}

/** Reads only display fields. Authorization is always evaluated against user_roles on the server. */
export async function getCurrentMemberProfile(userId: string): Promise<MemberProfile | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name, last_name, preferred_locale, timezone")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

/**
 * Resolves the caller's sole active household from their RLS-visible membership.
 * The database enforces a single active membership; the bounded, ordered query
 * additionally fails safely if a legacy data-integrity problem is encountered.
 */
export async function getCurrentHouseholdContext(): Promise<CurrentHouseholdContext | null> {
  const claims = await getCurrentSupabaseClaims();
  if (!claims || typeof claims.sub !== "string") return null;

  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("household_members")
    .select("household:households!inner(id, name, deleted_at), permission")
    .eq("user_id", claims.sub)
    .eq("status", "active")
    .is("household.deleted_at", null)
    .order("joined_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(2);

  if (error) {
    throw new Error("Unable to resolve the active household.");
  }

  const memberships = (data ?? []) as ActiveHouseholdMembership[];
  if (memberships.length === 0) return null;
  if (memberships.length > 1) {
    console.error("Active household resolution found multiple active memberships.");
  }

  const membership = memberships[0];
  if (!membership?.household) return null;

  return {
    household: { id: membership.household.id, name: membership.household.name },
    permission: membership.permission,
    userId: claims.sub,
  };
}

/** Reads the caller's active household through the shared membership resolver. */
export async function getCurrentHousehold(): Promise<HouseholdSummary | null> {
  return (await getCurrentHouseholdContext())?.household ?? null;
}

/** Returns null for an unavailable or untrusted role so callers fail closed. */
export async function getCurrentUserRole(userId: string): Promise<SupabaseRole | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return error || !data ? null : data.role;
}
