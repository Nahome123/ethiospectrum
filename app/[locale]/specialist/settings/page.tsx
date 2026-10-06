import { ProfileSettings } from "@/components/settings/profile-settings";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ProfileSettings locale={locale as AppLocale} />;
}
