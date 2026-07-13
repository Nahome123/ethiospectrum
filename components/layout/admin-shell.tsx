import { getTranslations } from "next-intl/server";
import { brandConfig } from "@/config/brand";
import { LanguageSelector } from "./language-selector";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "./brand-logo";

const links = [
  "users",
  "resources",
  "translations",
  "documents",
  "specialists",
  "prompts",
  "auditLogs",
] as const;
export async function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations();
  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-slate-700 bg-slate-900 p-5 text-white lg:border-b-0 lg:border-r">
        <Link href="/admin" aria-label={brandConfig.name} className="inline-block">
          <BrandLogo onDark className="h-10 w-48" />
        </Link>
        <p className="mt-1 text-sm text-slate-300">{t("navigation.admin")}</p>
        <nav aria-label={t("navigation.admin")} className="mt-6 flex gap-2 overflow-x-auto lg:flex-col">
          <Link
            className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-800"
            href="/admin"
          >
            {t("admin.overview")}
          </Link>
          {links.map((link) => (
            <Link
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-800"
              href={`/admin/${link === "auditLogs" ? "audit-logs" : link}`}
              key={link}
            >
              {t(`navigation.${link}`)}
            </Link>
          ))}
        </nav>
      </aside>
      <div>
        <header className="flex min-h-16 items-center justify-between border-b border-border bg-white px-4 sm:px-6">
          <p className="text-sm font-bold text-primary">{t("common.developmentOnly")}</p>
          <LanguageSelector />
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
