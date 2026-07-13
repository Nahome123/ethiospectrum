import "server-only";
import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export type AppRole = "member" | "specialist" | "content_editor" | "administrator";

export interface AuthenticatedUser {
  id: string;
  role: AppRole;
}

/**
 * Foundation-mode boundary. Replace this with a server-side Supabase session lookup.
 * It deliberately returns no session: route access is never granted by a client flag.
 */
async function getServerSession(): Promise<AuthenticatedUser | null> {
  return null;
}

export async function requireUser(locale: AppLocale, returnTo: string): Promise<AuthenticatedUser> {
  const user = await getServerSession();
  if (!user) {
    redirect({ href: { pathname: "/login", query: { next: returnTo } }, locale });
    throw new Error("Authentication redirect did not complete");
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
    redirect({ href: "/login", locale });
    throw new Error("Authorization redirect did not complete");
  }
  return user;
}
