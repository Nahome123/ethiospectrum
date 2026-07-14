import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireServerSupabaseEnv } from "@/lib/env/server";
import type { User } from "./types";

/**
 * Creates a request-scoped client for Server Components.
 * Server Components cannot write cookies; session refresh belongs in middleware or a mutable request boundary.
 */
export async function createServerComponentSupabaseClient() {
  const env = requireServerSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(env.url, env.publishableKey, {
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
