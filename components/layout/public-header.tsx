"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { brandConfig } from "@/config/brand";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "./brand-logo";
import { LanguageSelector } from "./language-selector";

const links = [
  { key: "features", href: "/features" },
  { key: "howItWorks", href: "/how-it-works" },
  { key: "resources", href: "/resources" },
  { key: "pricing", href: "/pricing" },
] as const;

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const t = useTranslations();

  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-primary"
          aria-label={brandConfig.name}
        >
          <BrandLogo priority className="h-11 w-52 sm:w-56" />
        </Link>
        <nav aria-label={t("navigation.home")} className="hidden items-center gap-6 lg:flex">
          {links.map(({ key, href }) => (
            <Link className="text-sm font-medium text-slate-700 hover:text-primary" href={href} key={key}>
              {t(`navigation.${key}`)}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSelector />
          <Link
            className="rounded-md px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary"
            href="/login"
          >
            {t("navigation.login")}
          </Link>
          <Link
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            href="/signup"
          >
            {t("navigation.signup")}
          </Link>
        </div>
        <button
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(!open)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-primary lg:hidden"
        >
          <span className="sr-only">{open ? t("accessibility.closeMenu") : t("common.openMenu")}</span>
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-nav"
          aria-label={t("accessibility.mobileNavLabel")}
          className="border-t border-border px-4 py-4 lg:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-2">
            {links.map(({ key, href }) => (
              <Link
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 font-medium hover:bg-secondary"
                href={href}
                key={key}
              >
                {t(`navigation.${key}`)}
              </Link>
            ))}
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <LanguageSelector />
              <Link
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 font-semibold text-primary"
                href="/login"
              >
                {t("navigation.login")}
              </Link>
              <Link
                onClick={() => setOpen(false)}
                className="rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
                href="/signup"
              >
                {t("navigation.signup")}
              </Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
