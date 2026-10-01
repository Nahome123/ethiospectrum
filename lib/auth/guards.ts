import "server-only";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { getCurrentSupabaseClaims, getCurrentUserRoleRecord } from "@/lib/supabase/server";
import type { SupabaseRole } from "@/lib/supabase/types";
import { getLocaleDashboardPath, getSafeLocaleRedirect } from "./redirects";
import { roleChangedSignOutPath, roleChangedSinceSignIn } from "./role-session";

export type AppRole = SupabaseRole;

export interface AuthenticatedUser {
  id: string;
  role: AppRole | null;
}

async function currentLocale(): Promise<AppLocale> {
  try {
    const locale = await getLocale();
    return (routing.locales as readonly string[]).includes(locale) ? (locale as AppLocale) : "en";
  } catch {
    return "en";
  }
}

/**
 * Resolves the signed-in user and their role. A session that signed in before
 * its role last changed is ended, so the user signs in again under the new role.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const claims = await getCurrentSupabaseClaims();
  if (!claims || typeof claims.sub !== "string") return null;
  const record = await getCurrentUserRoleRecord(claims.sub);
  if (roleChangedSinceSignIn(record?.grantedAt, claims)) {
    redirect(roleChangedSignOutPath(await currentLocale()));
  }
  return { id: claims.sub, role: record?.role ?? null };
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
  role: AppRole | readonly AppRole[],
): Promise<AuthenticatedUser> {
  const user = await requireUser(locale, returnTo);
  const allowed: readonly AppRole[] = typeof role === "string" ? [role] : role;
  if (!user.role || !allowed.includes(user.role)) {
    redirect(`/${locale}/auth-error?reason=access-denied`);
  }
  return user;
}
