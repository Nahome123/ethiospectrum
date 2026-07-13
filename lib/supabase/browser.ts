"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicSupabaseEnv } from "@/lib/env/client";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

/** Use only from Client Components. This utility has no access to service-role configuration. */
export function createBrowserSupabaseClient() {
  if (!browserClient) {
    const env = requirePublicSupabaseEnv();
    browserClient = createBrowserClient(env.url, env.anonKey);
  }
  return browserClient;
}
