import type { AppLocale } from "@/i18n/routing";
import type { SupabaseRole } from "@/lib/supabase/types";

type SessionClaims = {
  iat?: unknown;
  amr?: unknown;
};

/**
 * When the session's user actually signed in, in seconds. The `amr` timestamps
 * are the authentication events and do not move when the access token is
 * refreshed; `iat` is the fallback for tokens without them.
 */
export function sessionSignedInAt(claims: SessionClaims): number | null {
  if (Array.isArray(claims.amr)) {
    const timestamps = claims.amr
      .map((entry) =>
        entry && typeof entry === "object" ? (entry as { timestamp?: unknown }).timestamp : null,
      )
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (timestamps.length > 0) return Math.max(...timestamps);
  }
  return typeof claims.iat === "number" && Number.isFinite(claims.iat) ? claims.iat : null;
}

/** True when the role was granted or changed after this session signed in. */
export function roleChangedSinceSignIn(
  roleGrantedAt: string | null | undefined,
  claims: SessionClaims,
): boolean {
  if (!roleGrantedAt) return false;
  const signedInAt = sessionSignedInAt(claims);
  const grantedAt = Date.parse(roleGrantedAt);
  if (signedInAt === null || Number.isNaN(grantedAt)) return false;
  return Math.floor(grantedAt / 1000) > signedInAt;
}

/** Ends the session through a route handler, which may clear auth cookies. */
export function roleChangedSignOutPath(locale: AppLocale): string {
  return `/auth/signout?reason=role-changed&locale=${locale}`;
}

/** Each role's own workspace; administrators start in the admin console. */
export function getRoleHomePath(locale: AppLocale, role: SupabaseRole | null): string {
  if (role === "administrator") return `/${locale}/admin`;
  if (role === "specialist") return `/${locale}/specialist`;
  return `/${locale}/dashboard`;
}

/** Administrators hold the specialist role as well. */
export function hasSpecialistRole(role: SupabaseRole | null | undefined): boolean {
  return role === "specialist" || role === "administrator";
}
