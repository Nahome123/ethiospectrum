import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ResourceCoverPlaceholder } from "@/components/resources/resource-cover-placeholder";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { SafeMarkdown } from "@/components/resources/safe-markdown";
import type { ResourceCategory } from "@/lib/resources/constants";
import { getResourceFallbackNoticeKey } from "@/lib/resources/public-selection";
import { getPublishedResource } from "@/lib/resources/server";

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; slug: string }>;
}) {
  const { locale, slug } = await params;
  const [t, resource] = await Promise.all([
    getTranslations({ locale, namespace: "resourceWorkflow" }),
    getPublishedResource(slug, locale),
  ]);
  if (!resource) notFound();
  const category = resource.category as ResourceCategory;
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-12">
      <Link className="text-sm underline" href="/resources">
        {t("backToResources")}
      </Link>
      <article className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <header className="p-6 sm:p-10">
          <p className="text-sm font-semibold text-primary">{t(`categories.${category}`)}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{resource.title}</h1>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">{resource.summary}</p>
        </header>
        <ResourceCoverPlaceholder
          category={category}
          categoryLabel={t(`categories.${category}`)}
          className="aspect-[16/7] border-y border-border"
        />
        <div className="mx-auto max-w-3xl p-6 sm:p-10">
          {getResourceFallbackNoticeKey(locale, resource.usingEnglishFallback) ? (
            <p className="mt-4 rounded-md border p-3 text-sm" role="status">
              {t(getResourceFallbackNoticeKey(locale, resource.usingEnglishFallback)!)}
            </p>
          ) : null}
          <div className="mt-8">
            <SafeMarkdown body={resource.body} />
          </div>
        </div>
      </article>
    </main>
  );
}
