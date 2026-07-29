import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { RoadmapFilters } from "@/components/roadmap/roadmap-filters";
import { RoadmapItemCard } from "@/components/roadmap/roadmap-item-card";
import { ROADMAP_PAGE_SIZE } from "@/lib/roadmap/constants";
import { roadmapQueryString, parseRoadmapQuery } from "@/lib/roadmap/query-state";
import { getRoadmapContext, getRoadmapDependents, getRoadmapItems } from "@/lib/roadmap/server";

export default async function RoadmapPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const query = parseRoadmapQuery(await searchParams);
  const t = await getTranslations({ locale, namespace: "roadmap" });
  const context = await getRoadmapContext();
  if (!context) return <p role="alert">{t("accessDenied")}</p>;

  const [dependents, items] = await Promise.all([
    getRoadmapDependents(context.household.id),
    getRoadmapItems(query),
  ]);
  const total = items[0]?.total_count ?? 0;
  const hasFilters =
    query.assignee !== "all" ||
    Boolean(
      query.status || query.priority || query.category || query.dependent || query.overdue || query.completed,
    );
  const canShowReorder = !query.archived && !hasFilters && query.sort === "manual";
  const previous = { ...query, page: Math.max(1, query.page - 1) };
  const next = { ...query, page: query.page + 1 };

  return (
    <section className="mx-auto max-w-6xl space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{context.household.name}</p>
          <h1 className="mt-1 text-3xl font-bold">
            {query.archived ? t("archivedItems") : t("householdRoadmap")}
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{t("description")}</p>
        </div>
        {context.canCreate ? (
          <Link
            className="min-h-10 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
            href="/roadmap/new"
          >
            {t("newActionItem")}
          </Link>
        ) : (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold" role="status">
            {t("readOnly")}
          </p>
        )}
      </div>
      <RoadmapFilters
        canManageArchived={context.canManageArchived}
        dependents={dependents.map((dependent) => ({
          id: dependent.id,
          label: dependent.preferred_name || dependent.first_name,
        }))}
        locale={locale}
        query={query}
      />
      {items.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-bold">{hasFilters ? t("noMatchingItems") : t("noItems")}</h2>
          <p className="mt-2 text-muted-foreground">
            {context.canCreate ? t("emptyDescription") : t("readOnlyDescription")}
          </p>
        </div>
      ) : (
        <>
          <ul className="grid gap-4" aria-label={t("actionItems")}>
            {items.map((item, index) => (
              <RoadmapItemCard
                count={items.length}
                index={index}
                item={item}
                key={item.id}
                locale={locale}
                showReorder={canShowReorder}
              />
            ))}
          </ul>
          {total > ROADMAP_PAGE_SIZE ? (
            <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
              {query.page > 1 ? (
                <Link
                  className="rounded-md border border-border px-3 py-2 text-sm font-semibold"
                  href={`/roadmap${roadmapQueryString(previous)}`}
                >
                  {t("previous")}
                </Link>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted-foreground">{t("page", { page: query.page })}</p>
              {query.page * ROADMAP_PAGE_SIZE < total ? (
                <Link
                  className="rounded-md border border-border px-3 py-2 text-sm font-semibold"
                  href={`/roadmap${roadmapQueryString(next)}`}
                >
                  {t("next")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
