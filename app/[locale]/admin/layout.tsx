import { AdminShell } from "@/components/layout/admin-shell";
import { requireRole } from "@/lib/auth/guards";
import type { AppLocale } from "@/i18n/routing";
export default async function AdminLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  await requireRole(locale, `/${locale}/admin`, "administrator");
  return <AdminShell>{children}</AdminShell>;
}
