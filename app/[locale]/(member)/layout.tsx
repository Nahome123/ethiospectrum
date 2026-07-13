import { MemberShell } from "@/components/layout/member-shell";
import { requireUser } from "@/lib/auth/guards";
import type { AppLocale } from "@/i18n/routing";
export default async function MemberLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  await requireUser(locale, `/${locale}/dashboard`);
  return <MemberShell>{children}</MemberShell>;
}
