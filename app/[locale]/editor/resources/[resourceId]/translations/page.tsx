import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getTranslationDashboard, type TranslationLocale } from "@/lib/resources/translations-server";
import { parentStatus } from "@/lib/resources/translation-dashboard";

export const dynamic = "force-dynamic";
function state(translation: { review_status: string; isStale: boolean } | null) {
  return !translation ? "notStarted" : translation.isStale ? "stale" : translation.review_status;
}
function formatUpdatedAt(value: string | null | undefined, locale: AppLocale): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? null
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
        date,
      );
}
export default async function TranslationDashboardPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; resourceId: string }>;
}) {
  const { locale, resourceId } = await params;
  const [t, dashboard] = await Promise.all([
    getTranslations({ locale, namespace: "resourceWorkflow" }),
    getTranslationDashboard(resourceId),
  ]);
  if (!dashboard) notFound();
  const authoritativeParentStatus = parentStatus(dashboard.resource.status);
  return (
    <>
      <Link className="text-sm underline" href={`/admin/resources/${resourceId}`}>
        {t("backToEditor")}
      </Link>
      <header className="mt-6">
        <h1 className="text-3xl font-bold">{t("resourceTranslations")}</h1>
        <p className="mt-2 text-muted-foreground">{dashboard.english.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("englishSourceVersion")}: {dashboard.english.version}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("parentResourceStatus")}:{" "}
          {authoritativeParentStatus ? t(`statuses.${authoritativeParentStatus}`) : t("status")}
        </p>
      </header>
      <section className="mt-7 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="p-4">{t("translationLocale")}</th>
              <th className="p-4">{t("reviewStatus")}</th>
              <th className="p-4">{t("translationSourceVersion")}</th>
              <th className="p-4">{t("lastUpdated")}</th>
              <th className="p-4">{t("status")}</th>
              <th className="p-4">{t("workflowActions")}</th>
            </tr>
          </thead>
          <tbody>
            {(["am", "es"] as TranslationLocale[]).map((translationLocale) => {
              const translation = dashboard.translations[translationLocale];
              const translationState = state(translation);
              const href = `/editor/resources/${resourceId}/translations/${translationLocale}${translation ? "" : "/edit"}`;
              return (
                <tr className="border-b last:border-0" key={translationLocale}>
                  <td className="p-4">
                    {t(translationLocale === "am" ? "amharicTranslation" : "spanishTranslation")}
                  </td>
                  <td className="p-4">{t(`translationStates.${translationState}`)}</td>
                  <td className="p-4">{translation?.source_translation_version ?? "—"}</td>
                  <td className="p-4">
                    {formatUpdatedAt(translation?.updated_at, locale) ?? t("translationStates.notStarted")}
                  </td>
                  <td className="p-4">
                    {translation?.isStale
                      ? t("translationOutdated")
                      : translation
                        ? t("translationCurrent")
                        : "—"}
                  </td>
                  <td className="p-4">
                    <Link className="underline" href={href}>
                      {translation
                        ? translation.review_status === "draft"
                          ? t("editTranslation")
                          : t("reviewTranslation")
                        : t("createTranslation")}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
