import "server-only";
import { redirect } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getCurrentSupabaseClaims, getCurrentUserRole } from "@/lib/supabase/server";
import type { SupabaseRole } from "@/lib/supabase/types";
import { getLocaleDashboardPath, getSafeLocaleRedirect } from "./redirects";

export type AppRole = SupabaseRole;

export interface AuthenticatedUser {
  id: string;
  role: AppRole | null;
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const claims = await getCurrentSupabaseClaims();
  if (!claims || typeof claims.sub !== "string") return null;
  return { id: claims.sub, role: await getCurrentUserRole(claims.sub) };
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
