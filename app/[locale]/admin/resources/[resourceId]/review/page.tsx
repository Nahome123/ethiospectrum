import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";
import { ResourceTransitionControls } from "@/components/resources/resource-transition-controls";
import { SafeMarkdown } from "@/components/resources/safe-markdown";
import { getEditorResource, isReviewStatus } from "@/lib/resources/server";

export default async function ReviewResourcePage({
  params,
}: {
  params: Promise<{ locale: AppLocale; resourceId: string }>;
}) {
  const { locale, resourceId } = await params;
  const [t, resource] = await Promise.all([
    getTranslations({ locale, namespace: "resourceWorkflow" }),
    getEditorResource(resourceId),
  ]);
  if (!resource?.english || !isReviewStatus(resource.english.review_status)) notFound();
  return (
    <main className="max-w-4xl">
      <h1 className="text-3xl font-bold">{t("reviewStatus")}</h1>
      <article className="mt-7 rounded-xl border bg-card p-6">
        <h2 className="text-2xl font-semibold">{resource.english.title}</h2>
        <p className="mt-3 text-muted-foreground">{resource.english.summary}</p>
        <div className="mt-7 border-t pt-7">
          <SafeMarkdown body={resource.english.body} />
        </div>
      </article>
      <section className="mt-6 rounded-xl border bg-card p-5">
        <ResourceTransitionControls
          locale={locale}
          resourceId={resourceId}
          reviewStatus={resource.english.review_status}
          status={resource.status}
          version={resource.version}
        />
      </section>
    </main>
  );
}
