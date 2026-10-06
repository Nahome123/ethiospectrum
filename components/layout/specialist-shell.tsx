import { getLocale, getTranslations } from "next-intl/server";
import { brandConfig } from "@/config/brand";
import { LanguageSelector } from "./language-selector";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "./brand-logo";
import { NotificationBell } from "./notification-bell";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentMemberProfile, getCurrentSupabaseUser, getCurrentUserRole } from "@/lib/supabase/server";
import { AdminViewSwitcher } from "./admin-view-switcher";
import type { AppLocale } from "@/i18n/routing";

/** The specialist workspace has exactly these four destinations, none shared with the family workspace. */
const links = [
  ["dashboard", "/specialist"],
  ["closed", "/specialist?scope=closed"],
  ["settings", "/specialist/settings"],
  ["notifications", "/specialist/notifications"],
] as const;

export async function SpecialistShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const user = await getCurrentSupabaseUser();
  const [profile, role] = user
    ? await Promise.all([getCurrentMemberProfile(user.id), getCurrentUserRole(user.id)])
    : [null, null];
  const displayName = profile?.first_name || user?.email || t("member.profile");

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-border bg-white p-5 lg:border-b-0 lg:border-r">
        <Link href="/specialist" aria-label={brandConfig.name} className="inline-block">
          <BrandLogo className="h-10 w-48" />
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">{t("specialistConsole.workspace")}</p>
        <nav aria-label={t("specialistConsole.workspace")} className="mt-6 grid gap-1">
          {links.map(([key, href]) => (
            <Link
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              href={href}
              key={key}
            >
              {t(`specialistConsole.nav.${key}`)}
            </Link>
          ))}
        </nav>
      </aside>
      <div>
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 sm:px-6">
          {role === "administrator" ? (
            <AdminViewSwitcher current="specialist" />
          ) : (
            <p className="text-sm font-semibold text-primary">{t("specialistConsole.workspace")}</p>
          )}
          <div className="flex items-center gap-3">
            <NotificationBell audience="specialist" />
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
