import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";
import { ResourceForm } from "@/components/resources/resource-form";
import { getEditorResource } from "@/lib/resources/server";

export const dynamic = "force-dynamic";

export default async function EditResourcePage({
  params,
}: {
  params: Promise<{ locale: AppLocale; resourceId: string }>;
}) {
  const { locale, resourceId } = await params;
  const [t, resource] = await Promise.all([
    getTranslations({ locale, namespace: "resourceWorkflow" }),
    getEditorResource(resourceId),
  ]);
  if (!resource?.english || resource.status !== "draft") notFound();
  return (
    <main className="max-w-3xl">
      <h1 className="text-3xl font-bold">{t("edit")}</h1>
      <div className="mt-7 rounded-xl border bg-card p-5 sm:p-7">
        <ResourceForm
          expectedVersion={resource.version}
          initial={{
            slug: resource.slug,
            category: resource.category as "general",
            title: resource.english.title,
            summary: resource.english.summary,
            body: resource.english.body,
          }}
          locale={locale}
          resourceId={resourceId}
        />
      </div>
    </main>
  );
}
