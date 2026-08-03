import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { ResourceTransitionControls } from "@/components/resources/resource-transition-controls";
import { ResourceDiscoveryForm } from "@/components/resources/resource-discovery-form";
import type { ResourceType } from "@/lib/resources/constants";
import { isReviewStatus, getEditorResource } from "@/lib/resources/server";

export const dynamic = "force-dynamic";

export default async function EditorResourcePage({
  params,
}: {
  params: Promise<{ locale: AppLocale; resourceId: string }>;
}) {
  const { locale, resourceId } = await params;
  const [t, resource] = await Promise.all([
    getTranslations({ locale, namespace: "resourceWorkflow" }),
    getEditorResource(resourceId),
  ]);
  if (!resource || !resource.english || !isReviewStatus(resource.english.review_status)) notFound();
  return (
    <main className="max-w-4xl">
      <Link className="text-sm underline" href="/admin/resources">
        {t("backToEditor")}
      </Link>
      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{resource.english.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {t("statuses." + resource.status)} · {t("statuses." + resource.english.review_status)}
          </p>
        </div>
        {resource.status === "draft" ? (
          <Link
            className="rounded-md border px-4 py-2 text-sm font-medium"
            href={`/admin/resources/${resourceId}/edit`}
          >
            {t("edit")}
          </Link>
        ) : null}
        <Link
          className="rounded-md border px-4 py-2 text-sm font-medium"
          href={`/editor/resources/${resourceId}/translations`}
        >
          {t("manageTranslations")}
        </Link>
      </header>
      <section className="mt-7 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">{t("discoveryTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("discoveryDescription")}</p>
        <div className="mt-5">
          <ResourceDiscoveryForm
            expectedVersion={resource.version}
            featuredRank={resource.featured_rank}
            locale={locale}
            resourceId={resourceId}
            resourceType={resource.resource_type as ResourceType}
          />
        </div>
      </section>
      <section className="mt-7 rounded-xl border bg-card p-5">
        <ResourceTransitionControls
          locale={locale}
          resourceId={resourceId}
          reviewStatus={resource.english.review_status}
          status={resource.status}
          version={resource.version}
        />
      </section>
      <section className="mt-7 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">{t("audit")}</h2>
        <ol className="mt-4 space-y-2 text-sm">
          {resource.audits.map((event) => (
            <li className="border-b pb-2 last:border-0" key={event.id}>
              {event.action} · {event.created_at}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
