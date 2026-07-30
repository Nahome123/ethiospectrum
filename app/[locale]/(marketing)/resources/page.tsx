import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { resourceCategoryValues, type ResourceCategory } from "@/lib/resources/constants";
import { getPublishedResources } from "@/lib/resources/server";

export default async function ResourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const [{ locale }, search] = await Promise.all([params, searchParams]);
  const t = await getTranslations({ locale, namespace: "resources" });
  const category = resourceCategoryValues.includes(search.category as ResourceCategory)
    ? (search.category as ResourceCategory)
    : undefined;
  const resources = await getPublishedResources(category);
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
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {resources.length ? (
          resources.map((resource) => (
            <article className="rounded-xl border bg-card p-5" key={resource.id}>
              <p className="text-sm text-muted-foreground">
                {t(`categories.${resource.category as ResourceCategory}`)}
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                <Link className="hover:underline" href={`/resources/${resource.slug}`}>
                  {resource.title}
                </Link>
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{resource.summary}</p>
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
