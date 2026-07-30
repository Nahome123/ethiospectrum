import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getEditorResources } from "@/lib/resources/server";

export default async function EditorResourcesPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const [t, resources] = await Promise.all([
    getTranslations({ locale, namespace: "resourceWorkflow" }),
    getEditorResources(),
  ]);
  return (
    <main>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("editorTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("description")}</p>
        </div>
        <Link
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          href="/admin/resources/new"
        >
          {t("new")}
        </Link>
      </header>
      <section className="mt-8 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="p-4">{t("title")}</th>
              <th className="p-4">{t("status")}</th>
              <th className="p-4">{t("reviewStatus")}</th>
              <th className="p-4">{t("category")}</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((resource) => (
              <tr className="border-b last:border-0" key={resource.id}>
                <td className="p-4 font-medium">
                  <Link className="underline" href={`/admin/resources/${resource.id}`}>
                    {resource.english?.title ?? resource.slug}
                  </Link>
                </td>
                <td className="p-4">{t(`statuses.${resource.status}`)}</td>
                <td className="p-4">
                  {resource.english ? t(`statuses.${resource.english.review_status as "draft"}`) : "—"}
                </td>
                <td className="p-4">{resource.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {resources.length ? null : (
          <p className="p-4 text-muted-foreground" role="status">
            {t("noResources")}
          </p>
        )}
      </section>
    </main>
  );
}
