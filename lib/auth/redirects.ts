import { routing, type AppLocale } from "@/i18n/routing";

const supportedLocales = new Set<string>(routing.locales);

export function isSafeInternalPath(value: string | null | undefined): value is string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  try {
    const parsed = new URL(value, "https://ethiospectrum.invalid");
    return parsed.origin === "https://ethiospectrum.invalid" && parsed.pathname.startsWith("/");
  } catch {
    return false;
  }
}

export function getLocaleFromPath(path: string): AppLocale | null {
  const locale = path.split("/")[1];
  return supportedLocales.has(locale) ? (locale as AppLocale) : null;
}

export function getSafeLocaleRedirect(
  next: string | null | undefined,
  fallback: string,
  requiredLocale?: AppLocale,
): string {
  if (!isSafeInternalPath(next)) return fallback;
  const nextLocale = getLocaleFromPath(next);
  if (!nextLocale || (requiredLocale && nextLocale !== requiredLocale)) return fallback;
  return next;
}

export function getLocaleDashboardPath(locale: AppLocale): string {
  return `/${locale}/dashboard`;
}
