"use client";

import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

const locales: { value: AppLocale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "am", label: "አማርኛ" },
  { value: "es", label: "Español" },
];

export function LanguageSelector() {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("accessibility");

  return (
    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
      <Languages aria-hidden="true" className="size-4 text-primary" />
      <span className="sr-only">{t("languageSelectorLabel")}</span>
      <select
        aria-label={t("languageSelectorLabel")}
        className="min-h-10 rounded-md border border-border bg-white px-2 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        value={locale}
        onChange={(event) => {
          const nextLocale = event.target.value as AppLocale;
          const href =
            pathname === `/${locale}`
              ? "/"
              : pathname.startsWith(`/${locale}/`)
                ? pathname.slice(locale.length + 1)
                : pathname;
          router.replace(href, { locale: nextLocale });
        }}
      >
        {locales.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
