import { getTranslations } from "next-intl/server";
import { DependentForm } from "@/components/dependents/dependent-form";
import type { AppLocale } from "@/i18n/routing";
import { getDependentContext } from "@/lib/dependents/server";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("dependents");
  if (!(await getDependentContext())?.canManage) return <p>{t("accessDenied")}</p>;
  return (
    <section className="max-w-xl">
      <h1 className="text-3xl font-bold">{t("add")}</h1>
      <div className="mt-8 rounded-xl border bg-white p-6">
        <DependentForm locale={locale as AppLocale} />
      </div>
    </section>
  );
}
