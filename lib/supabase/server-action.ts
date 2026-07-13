import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireServerSupabaseEnv } from "@/lib/env/server";

/** Use from Server Actions, where Next.js allows response cookie mutation. */
export async function createServerActionSupabaseClient() {
  const env = requireServerSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
