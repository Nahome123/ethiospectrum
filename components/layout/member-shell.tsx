import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { brandConfig } from "@/config/brand";
import { LanguageSelector } from "./language-selector";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "./brand-logo";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentSupabaseUser } from "@/lib/supabase/server";
import type { AppLocale } from "@/i18n/routing";

const links = [
  "dashboard",
  "onboarding",
  "dependents",
  "documents",
  "assistant",
  "roadmap",
  "resources",
  "support",
  "settings",
] as const;
export async function MemberShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const user = await getCurrentSupabaseUser();
  const firstName =
    typeof user?.user_metadata.first_name === "string" ? user.user_metadata.first_name.trim() : "";
  const displayName = firstName || user?.email || t("member.profile");
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-border bg-white p-5 lg:border-b-0 lg:border-r">
        <Link href="/dashboard" aria-label={brandConfig.name} className="inline-block">
          <BrandLogo className="h-10 w-48" />
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">{t("member.workspace")}</p>
        <nav aria-label={t("member.workspace")} className="mt-6 flex gap-2 overflow-x-auto lg:flex-col">
          {links.map((link) => (
            <Link
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
              href={link === "resources" ? "/member/resources" : `/${link}`}
              key={link}
            >
              {t(`navigation.${link}`)}
            </Link>
          ))}
        </nav>
      </aside>
      <div>
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 sm:px-6">
          <label className="text-sm font-semibold">
            {t("member.dependentSelector")}
            <select className="ml-2 min-h-10 rounded-md border border-input bg-white px-2">
              <option>{t("member.allDependents")}</option>
            </select>
          </label>
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
