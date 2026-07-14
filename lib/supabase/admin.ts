import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAdminEnv } from "@/lib/env/server";

/**
 * Service-role boundary: this bypasses RLS and is restricted to reviewed administrative or background work.
 * Never import this module into Client Components, route UI, or ordinary user-request handlers.
 */
export function createSupabaseAdminClient() {
  const env = requireSupabaseAdminEnv();
  return createClient(env.url, env.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
