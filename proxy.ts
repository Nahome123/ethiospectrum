import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);
  return updateSupabaseSession(request, response);
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
