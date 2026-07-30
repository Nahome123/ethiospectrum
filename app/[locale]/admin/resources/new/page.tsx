import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { ResourceForm } from "@/components/resources/resource-form";
import { getResourceAccountHolders } from "@/lib/resources/server";

export const dynamic = "force-dynamic";

export default async function NewResourcePage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const [t, accountHolders] = await Promise.all([
    getTranslations({ locale, namespace: "resourceWorkflow" }),
    getResourceAccountHolders(),
  ]);
  return (
    <main className="max-w-3xl">
      <h1 className="text-3xl font-bold">{t("new")}</h1>
      <div className="mt-7 rounded-xl border bg-card p-5 sm:p-7">
        <ResourceForm accountHolders={accountHolders} locale={locale} />
      </div>
    </main>
  );
}
