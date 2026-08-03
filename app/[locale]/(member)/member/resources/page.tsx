import type { AppLocale } from "@/i18n/routing";
import { MemberResourceHub } from "@/components/resources/member-resource-hub";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, search] = await Promise.all([params, searchParams]);
  return <MemberResourceHub locale={locale} searchParams={search} />;
}
