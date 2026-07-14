import { NextResponse, type NextRequest } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { getLocaleDashboardPath, getLocaleFromPath, getSafeLocaleRedirect } from "@/lib/auth/redirects";

const validOtpTypes = new Set(["signup", "recovery"]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const nextValue = url.searchParams.get("next");
  const locale = nextValue ? getLocaleFromPath(nextValue) : null;
  const fallback = locale ? `/${locale}/auth-error?reason=invalid` : "/en/auth-error?reason=invalid";
  const destination = getSafeLocaleRedirect(
    nextValue,
    getLocaleDashboardPath(locale ?? "en"),
    locale ?? undefined,
  );
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await createRouteHandlerSupabaseClient();

  if (code && code.length <= 2048) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(new URL(error ? fallback : destination, request.url));
  }
  if (tokenHash && type && validOtpTypes.has(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "signup" | "recovery",
    });
    return NextResponse.redirect(new URL(error ? fallback : destination, request.url));
  }
  return NextResponse.redirect(new URL(fallback, request.url));
}
