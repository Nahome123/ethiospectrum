import "server-only";

import { cookies } from "next/headers";
import type { AppLocale } from "@/i18n/routing";

export const passwordRecoveryCookieName = "ethiospectrum-password-recovery";

export function passwordRecoveryCookieOptions(locale: AppLocale) {
  return {
    httpOnly: true,
    maxAge: 15 * 60,
    path: `/${locale}/reset-password`,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function hasPasswordRecoveryIntent(locale: AppLocale): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(passwordRecoveryCookieName)?.value === locale;
}

export async function clearPasswordRecoveryIntent(locale: AppLocale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(passwordRecoveryCookieName, "", {
    ...passwordRecoveryCookieOptions(locale),
    maxAge: 0,
  });
}
