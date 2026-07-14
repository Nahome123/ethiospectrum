"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicSupabaseEnv } from "@/lib/env/client";

/** Use only from Client Components. This utility has no access to elevated server configuration. */
export function createBrowserSupabaseClient() {
  const env = requirePublicSupabaseEnv();
  return createBrowserClient(env.url, env.publishableKey);
}
