import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireServerSupabaseEnv } from "@/lib/env/server";
import type { Session, User } from "./types";

/**
 * Creates a request-scoped client for Server Components.
 * Server Components cannot write cookies; session refresh belongs in middleware or a mutable request boundary.
 */
export async function createServerComponentSupabaseClient() {
  const env = requireServerSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => undefined,
    },
  });
}

/** A session is informational only. Future authorization must verify the user server-side and rely on RLS. */
export async function getCurrentSupabaseSession(): Promise<Session | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error("Unable to read the current Supabase session.");
  }
  return data.session;
}

/** Uses Supabase Auth server-side verification. Returns null when no real authenticated user exists. */
export async function getCurrentSupabaseUser(): Promise<User | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error("Unable to verify the current Supabase user.");
  }
  return data.user;
}
