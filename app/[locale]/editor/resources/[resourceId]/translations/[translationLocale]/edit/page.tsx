import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { TranslationForm } from "@/components/resources/translation-form";
import { getTranslationDashboard, type TranslationLocale } from "@/lib/resources/translations-server";

export const dynamic = "force-dynamic";
export default async function EditTranslationPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; resourceId: string; translationLocale: string }>;
}) {
  const { locale, resourceId, translationLocale: value } = await params;
  if (value !== "am" && value !== "es") notFound();
  const translationLocale: TranslationLocale = value;
  const [t, dashboard] = await Promise.all([
    getTranslations({ locale, namespace: "resourceWorkflow" }),
    getTranslationDashboard(resourceId),
  ]);
  if (!dashboard || dashboard.resource.status === "archived") notFound();
  const translation = dashboard.translations[translationLocale];
  if (translation && translation.review_status !== "draft") notFound();
  return (
    <>
      <Link className="text-sm underline" href={`/editor/resources/${resourceId}/translations`}>
        {t("resourceTranslations")}
      </Link>
      <h1 className="mt-6 text-3xl font-bold">
        {translation ? t("editTranslation") : t("createTranslation")}
      </h1>
      <div className="mt-7 rounded-xl border bg-card p-5 sm:p-7">
        <TranslationForm
          locale={locale}
          resourceId={resourceId}
          translationLocale={translationLocale}
          english={dashboard.english}
          translation={translation}
        />
      </div>
    </>
  );
}
