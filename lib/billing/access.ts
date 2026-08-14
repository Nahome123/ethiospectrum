import "server-only";

import { redirect } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";
import { requireUser, type AuthenticatedUser } from "@/lib/auth/guards";
import { getCurrentHouseholdContext } from "@/lib/households/server";

/**
 * Household billing normally belongs to members. A platform administrator may
 * use the same household surface only when their active membership is owner.
 */
export async function requireHouseholdBillingAccess(
  locale: AppLocale,
  returnTo: string,
): Promise<AuthenticatedUser> {
  const user = await requireUser(locale, returnTo);
  if (user.role === "member") return user;

  if (user.role === "administrator") {
    const context = await getCurrentHouseholdContext();
    if (context?.permission === "owner") return user;
  }

  redirect(`/${locale}/auth-error?reason=access-denied`);
}
