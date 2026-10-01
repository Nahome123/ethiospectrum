import { SpecialistShell } from "@/components/layout/specialist-shell";
import { requireRole } from "@/lib/auth/guards";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export default async function SpecialistLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  // The global specialist role only opens this shell; each service request is
  // authorized by its live assignment in the database on every query.
  // Administrators hold the specialist role as well.
  await requireRole(locale, `/${locale}/specialist`, ["specialist", "administrator"]);
  return <SpecialistShell>{children}</SpecialistShell>;
}
