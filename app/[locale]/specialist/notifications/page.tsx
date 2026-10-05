import { NotificationList } from "@/components/notifications/notification-list";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, search] = await Promise.all([params, searchParams]);
  return <NotificationList audience="specialist" locale={locale as AppLocale} search={search} />;
}
