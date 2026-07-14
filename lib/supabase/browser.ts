"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicSupabaseEnv } from "@/lib/env/client";
import type { Database } from "./database.types";

/** Use only from Client Components. This utility has no access to elevated server configuration. */
export function createBrowserSupabaseClient() {
  const env = requirePublicSupabaseEnv();
  return createBrowserClient<Database>(env.url, env.publishableKey);
}
