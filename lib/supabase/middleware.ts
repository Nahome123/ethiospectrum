import "server-only";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, type NextResponse } from "next/server";
import { getServerSupabaseEnv } from "@/lib/env/server";

/**
 * Future middleware hook for refreshing Supabase Auth cookies.
 * Do not add it to proxy.ts until ETH-008 wires authentication behavior deliberately.
 */
export async function updateSupabaseSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const env = getServerSupabaseEnv();
  if (!env) return response;
  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}
