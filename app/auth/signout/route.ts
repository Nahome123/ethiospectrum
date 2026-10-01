import { NextResponse, type NextRequest } from "next/server";
import { routing, type AppLocale } from "@/i18n/routing";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

/**
 * Ends a session whose role changed after sign-in. Server Components cannot
 * clear auth cookies, so the guards redirect here. Signing out is the only
 * effect, and only the local session is cleared.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("locale") ?? "";
  const locale: AppLocale = (routing.locales as readonly string[]).includes(requested)
    ? (requested as AppLocale)
    : routing.defaultLocale;
  const supabase = await createRouteHandlerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  const destination = new URL(`/${locale}/login`, request.url);
  if (url.searchParams.get("reason") === "role-changed")
    destination.searchParams.set("notice", "role-changed");
  return NextResponse.redirect(destination);
}
