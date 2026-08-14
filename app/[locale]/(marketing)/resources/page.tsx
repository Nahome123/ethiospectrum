import { getTranslations } from "next-intl/server";
import { ResourceCoverPlaceholder } from "@/components/resources/resource-cover-placeholder";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { resourceCategoryValues, type ResourceCategory } from "@/lib/resources/constants";
import { getResourceFallbackNoticeKey } from "@/lib/resources/public-selection";
import { getPublishedResources } from "@/lib/resources/server";

export default async function ResourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const [{ locale }, search] = await Promise.all([params, searchParams]);
  const t = await getTranslations({ locale, namespace: "resourceWorkflow" });
  const category = resourceCategoryValues.includes(search.category as ResourceCategory)
    ? (search.category as ResourceCategory)
    : undefined;
  const resources = await getPublishedResources(locale, category, search.page);
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground">{t("description")}</p>
      </header>
      <nav aria-label={t("category")} className="mt-7 flex flex-wrap gap-2">
        <Link className="rounded-full border px-3 py-1.5 text-sm" href="/resources">
          {t("categories.general")}
        </Link>
        {resourceCategoryValues.map((item) => (
          <Link
            className="rounded-full border px-3 py-1.5 text-sm"
            href={`/resources?category=${item}`}
            key={item}
          >
            {t(`categories.${item}`)}
          </Link>
        ))}
      </nav>
      <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {resources.length ? (
          resources.map((resource) => (
            <article className="flex overflow-hidden rounded-xl border bg-card shadow-sm" key={resource.slug}>
              <div className="flex w-full flex-col">
                <ResourceCoverPlaceholder
                  category={resource.category as ResourceCategory}
                  categoryLabel={t(`categories.${resource.category as ResourceCategory}`)}
                />
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-xl font-semibold">
                    <Link className="hover:underline" href={`/resources/${resource.slug}`}>
                      {resource.title}
                    </Link>
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{resource.summary}</p>
                  {getResourceFallbackNoticeKey(locale, resource.usingEnglishFallback) ? (
                    <p className="mt-3 text-sm text-muted-foreground" role="status">
                      {t(getResourceFallbackNoticeKey(locale, resource.usingEnglishFallback)!)}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-xl border p-5 text-muted-foreground" role="status">
            {t("noResources")}
          </p>
        )}
      </section>
    </main>
  );
}
