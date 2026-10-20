import { NextResponse, type NextRequest } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { getLocaleDashboardPath, getLocaleFromPath, getSafeLocaleRedirect } from "@/lib/auth/redirects";
import { passwordRecoveryCookieName, passwordRecoveryCookieOptions } from "@/lib/auth/recovery";
import { getRoleHomePath } from "@/lib/auth/role-session";

const validOtpTypes = new Set(["signup", "recovery"]);

function responseForDestination(
  request: NextRequest,
  destination: string,
  fallback: string,
  locale: ReturnType<typeof getLocaleFromPath>,
  shouldMarkRecovery: boolean,
  hasError: boolean,
) {
  const response = NextResponse.redirect(new URL(hasError ? fallback : destination, request.url));
  if (!hasError && shouldMarkRecovery && locale) {
    response.cookies.set(passwordRecoveryCookieName, locale, passwordRecoveryCookieOptions(locale));
  }
  return response;
}

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
  const isResetDestination = destination === `/${locale}/reset-password`;
  const requestedRecoveryFlow = url.searchParams.get("flow") === "recovery";
  const supabase = await createRouteHandlerSupabaseClient();
  const oauth = url.searchParams.get("flow") === "oauth";

  // Google returns here with ?error=... when the person cancels or it fails.
  if (oauth && url.searchParams.get("error")) {
    return NextResponse.redirect(new URL(`/${locale ?? "en"}/auth-error?reason=oauth`, request.url));
  }

  if (code && code.length <= 2048) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (oauth) {
      if (error) {
        return NextResponse.redirect(new URL(`/${locale ?? "en"}/auth-error?reason=oauth`, request.url));
      }
      let target = destination;
      // Without an explicit destination, staff start in their own workspace,
      // as after a password sign-in.
      if (url.searchParams.get("home") === "1" && locale && data.user) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .maybeSingle();
        target = getRoleHomePath(locale, roleRow?.role ?? null);
      }
      return NextResponse.redirect(new URL(target, request.url));
    }
    return responseForDestination(
      request,
      destination,
      fallback,
      locale,
      requestedRecoveryFlow && isResetDestination,
      Boolean(error),
    );
  }
  if (tokenHash && type && validOtpTypes.has(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "signup" | "recovery",
    });
    return responseForDestination(
      request,
      destination,
      fallback,
      locale,
      type === "recovery" && isResetDestination,
      Boolean(error),
    );
  }
  return NextResponse.redirect(new URL(fallback, request.url));
}
