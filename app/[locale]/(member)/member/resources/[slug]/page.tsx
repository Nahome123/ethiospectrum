import { BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { ResourceCardActions } from "@/components/resources/resource-card-actions";
import { ResourceCoverPlaceholder } from "@/components/resources/resource-cover-placeholder";
import { SafeMarkdown } from "@/components/resources/safe-markdown";
import { getResourceFallbackNoticeKey } from "@/lib/resources/public-selection";
import { getMemberResource } from "@/lib/resources/server";

export default async function MemberResourceDetailPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; slug: string }>;
}) {
  const { locale, slug } = await params;
  const [t, workflow, resource] = await Promise.all([
    getTranslations({ locale, namespace: "resources" }),
    getTranslations({ locale, namespace: "resourceWorkflow" }),
    getMemberResource(slug, locale),
  ]);
  if (!resource) notFound();
  const fallbackKey = getResourceFallbackNoticeKey(locale, resource.usingEnglishFallback);

  return (
    <section className="mx-auto max-w-4xl">
      <Link className="text-sm font-semibold text-primary hover:underline" href="/member/resources">
        {t("backToHub")}
      </Link>
      <article className="mt-5 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <header className="bg-gradient-to-br from-secondary/70 to-background p-6 sm:p-10">
          <div className="flex flex-wrap gap-2 text-sm font-semibold">
            <span className="rounded-full bg-white px-3 py-1 shadow-sm">
              {workflow(`categories.${resource.category}`)}
            </span>
            <span className="rounded-full bg-white px-3 py-1 shadow-sm">
              {t(`types.${resource.resourceType}`)}
            </span>
            {resource.isAssigned ? (
              <span className="rounded-full bg-primary px-3 py-1 text-primary-foreground">
                {t("selectedForYou")}
              </span>
            ) : null}
          </div>
          <BookOpen aria-hidden="true" className="mt-8 size-10 text-primary" />
          <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{resource.title}</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">{resource.summary}</p>
          {fallbackKey ? (
            <p className="mt-4 rounded-md border border-border bg-white/80 p-3 text-sm" role="status">
              {workflow(fallbackKey)}
            </p>
          ) : null}
          <div className="mt-6">
            <ResourceCardActions
              initialBookmarked={resource.isBookmarked}
              initialOnRoadmap={resource.isOnRoadmap}
              locale={locale}
              slug={resource.slug}
            />
          </div>
        </header>
        <ResourceCoverPlaceholder
          category={resource.category}
          categoryLabel={workflow(`categories.${resource.category}`)}
          className="aspect-[16/7] border-y border-border"
        />
        <div className="mx-auto max-w-3xl p-6 sm:p-10">
          <p className="mb-8 rounded-md bg-secondary px-4 py-3 text-sm text-secondary-foreground">
            {t("educationalNotice")}
          </p>
          <SafeMarkdown body={resource.body} />
        </div>
      </article>
    </section>
  );
}
