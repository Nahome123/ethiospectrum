import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { ResourceForm } from "@/components/resources/resource-form";

export default async function NewResourcePage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "resources" });
  return (
    <main className="max-w-3xl">
      <h1 className="text-3xl font-bold">{t("new")}</h1>
      <div className="mt-7 rounded-xl border bg-card p-5 sm:p-7">
        <ResourceForm locale={locale} />
      </div>
    </main>
  );
}
