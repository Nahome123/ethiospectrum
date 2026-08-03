import type { AppLocale } from "@/i18n/routing";

export type ResourceFallbackNoticeKey = "amharicFallbackNotice" | "spanishFallbackNotice";

export function getResourceFallbackNoticeKey(
  locale: AppLocale | string,
  usingEnglishFallback: boolean,
): ResourceFallbackNoticeKey | null {
  if (!usingEnglishFallback) return null;
  if (locale === "am") return "amharicFallbackNotice";
  if (locale === "es") return "spanishFallbackNotice";
  return null;
}
