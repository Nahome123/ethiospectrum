import "server-only";
import { redirect } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getCurrentSupabaseClaims } from "@/lib/supabase/server";
import { getLocaleDashboardPath, getSafeLocaleRedirect } from "./redirects";

export type AppRole = "member" | "specialist" | "content_editor" | "administrator";

export interface AuthenticatedUser {
  id: string;
  role: AppRole | null;
}

function trustedRoleFromClaims(claims: Record<string, unknown>): AppRole | null {
  const appMetadata = claims.app_metadata;
  if (!appMetadata || typeof appMetadata !== "object") return null;
  const role = (appMetadata as Record<string, unknown>).role;
  return role === "member" || role === "specialist" || role === "content_editor" || role === "administrator"
    ? role
    : null;
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const claims = await getCurrentSupabaseClaims();
  if (!claims || typeof claims.sub !== "string") return null;
  return { id: claims.sub, role: trustedRoleFromClaims(claims as Record<string, unknown>) };
}

export async function requireUser(locale: AppLocale, returnTo: string): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) {
    const next = getSafeLocaleRedirect(returnTo, getLocaleDashboardPath(locale), locale);
    redirect(`/${locale}/login?next=${encodeURIComponent(next)}`);
  }
  return user;
}

export async function requireRole(
  locale: AppLocale,
  returnTo: string,
  role: AppRole,
): Promise<AuthenticatedUser> {
  const user = await requireUser(locale, returnTo);
  if (user.role !== role) {
    redirect(`/${locale}/auth-error?reason=access-denied`);
  }
  return user;
}
