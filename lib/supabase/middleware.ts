import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requireServerSupabaseEnv } from "@/lib/env/server";

/**
 * Future middleware hook for refreshing Supabase Auth cookies.
 * Do not add it to proxy.ts until ETH-008 wires authentication behavior deliberately.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const env = requireServerSupabaseEnv();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}
