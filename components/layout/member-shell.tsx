import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { brandConfig } from "@/config/brand";
import { LanguageSelector } from "./language-selector";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "./brand-logo";
import { NotificationBell } from "./notification-bell";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentMemberProfile, getCurrentSupabaseUser, getCurrentUserRole } from "@/lib/supabase/server";
import type { AppLocale } from "@/i18n/routing";
import { MemberNavigation } from "./member-navigation";
import { AdminViewSwitcher, MemberPreview } from "./admin-view-switcher";

/** Household workspace navigation (PRD sections 32-33). */
const householdLinks = [
  ["dashboard", "/dashboard"],
  ["services", "/services"],
  ["requests", "/requests"],
  ["training", "/training"],
  ["dependents", "/dependents"],
  ["documents", "/documents"],
  ["household", "/household"],
  ["billing", "/billing"],
  ["notifications", "/notifications"],
  ["settings", "/settings"],
] as const;

export async function MemberShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const user = await getCurrentSupabaseUser();
  const [profile, role] = user
    ? await Promise.all([getCurrentMemberProfile(user.id), getCurrentUserRole(user.id)])
    : [null, null];
  const displayName = profile?.first_name || user?.email || t("member.profile");
  // Administrators see the household area as a read-only preview.
  const isAdministrator = role === "administrator";
  // Staff accounts reach shared pages (notifications, settings) from their own workspace.
  const links =
    role === "specialist"
      ? ([
          ["specialistWorkspace", "/specialist"],
          ["notifications", "/notifications"],
          ["settings", "/settings"],
        ] as const)
      : householdLinks;

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-border bg-white p-5 lg:border-b-0 lg:border-r">
        <Link href="/dashboard" aria-label={brandConfig.name} className="inline-block">
          <BrandLogo className="h-10 w-48" />
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">{t("member.workspace")}</p>
        <MemberNavigation
          closeLabel={t("accessibility.closeMenu")}
          items={links.map(([key, href]) => ({ href, label: t(`navigation.${key}`) }))}
          label={t("member.workspace")}
          menuLabel={t("common.menu")}
          openLabel={t("common.openMenu")}
        />
      </aside>
      <div>
        <header className="flex min-h-16 flex-wrap items-center justify-end gap-3 border-b border-border bg-white px-4 py-3 sm:px-6">
          {isAdministrator ? (
            <div className="mr-auto">
              <AdminViewSwitcher current="member" />
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <NotificationBell />
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
        <main className="p-4 sm:p-6 lg:p-8">
          {isAdministrator ? <MemberPreview>{children}</MemberPreview> : children}
        </main>
      </div>
    </div>
  );
}
