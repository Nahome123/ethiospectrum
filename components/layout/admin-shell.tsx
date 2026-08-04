import { getLocale, getTranslations } from "next-intl/server";
import { brandConfig } from "@/config/brand";
import { LanguageSelector } from "./language-selector";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "./brand-logo";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentMemberProfile, getCurrentSupabaseUser } from "@/lib/supabase/server";
import type { AppLocale } from "@/i18n/routing";

const links = [
  "users",
  "resources",
  "translations",
  "documents",
  "supportRequests",
  "specialists",
  "prompts",
  "auditLogs",
] as const;
const linkPaths: Partial<Record<(typeof links)[number], string>> = {
  auditLogs: "audit-logs",
  supportRequests: "support-requests",
};
export async function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const user = await getCurrentSupabaseUser();
  const profile = user ? await getCurrentMemberProfile(user.id) : null;
  const displayName = profile?.first_name || user?.email || t("member.profile");

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
              href={`/admin/${linkPaths[link] ?? link}`}
              key={link}
            >
              {t(`navigation.${link}`)}
            </Link>
          ))}
        </nav>
      </aside>
      <div>
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 sm:px-6">
          <p className="text-sm font-bold text-primary">{t("common.developmentOnly")}</p>
          <div className="flex items-center gap-3">
            <LanguageSelector />
            <span className="max-w-40 truncate text-sm font-semibold" title={displayName}>
              {displayName}
            </span>
            <form action={signOutAction.bind(null, locale)}>
              <button
                type="submit"
                className="min-h-10 rounded-md border border-border px-3 text-sm font-semibold"
              >
                {t("member.logout")}
              </button>
            </form>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
