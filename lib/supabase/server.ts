import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireServerSupabaseEnv } from "@/lib/env/server";
import type { Database, MemberProfile, SupabaseRole, User } from "./types";

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
    .select("first_name, preferred_locale, timezone")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
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
