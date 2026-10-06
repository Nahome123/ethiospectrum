import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
  const user = await requireUser(locale, returnTo);
  // The family workspace is not shared with specialists; administrators keep
  // their read-only member preview.
  if (user.role === "specialist") redirect(`/${locale}/specialist`);
  return <MemberShell>{children}</MemberShell>;
}
