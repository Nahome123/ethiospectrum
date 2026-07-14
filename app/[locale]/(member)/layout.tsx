import { headers } from "next/headers";
import { MemberShell } from "@/components/layout/member-shell";
import { requireUser } from "@/lib/auth/guards";
import { getLocaleDashboardPath, getSafeLocaleRedirect } from "@/lib/auth/redirects";
import type { AppLocale } from "@/i18n/routing";
export default async function MemberLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const pathname = (await headers()).get("x-ethiospectrum-pathname");
  const returnTo = getSafeLocaleRedirect(pathname, getLocaleDashboardPath(locale), locale);
  await requireUser(locale, returnTo);
  return <MemberShell>{children}</MemberShell>;
}
