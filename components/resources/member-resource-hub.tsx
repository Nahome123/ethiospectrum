import {
  BookOpen,
  HeartPulse,
  Landmark,
  Scale,
  Search,
  Stethoscope,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resourceCategoryValues, resourceTypeValues, type ResourceCategory } from "@/lib/resources/constants";
import { getResourceFallbackNoticeKey } from "@/lib/resources/public-selection";
import { getMemberResources, type MemberResourceCard } from "@/lib/resources/server";
import { memberResourceQuerySchema, type MemberResourceQuery } from "@/lib/validation/resources";
import { MemberResourceCardView } from "./member-resource-card";

type SearchParams = Record<string, string | string[] | undefined>;

const topicPresentation: Record<ResourceCategory, { Icon: LucideIcon; className: string }> = {
  general: { Icon: BookOpen, className: "from-slate-100 to-slate-200 text-slate-800" },
  healthcare: { Icon: HeartPulse, className: "from-rose-100 to-orange-100 text-rose-800" },
  education: { Icon: BookOpen, className: "from-amber-100 to-yellow-200 text-amber-900" },
  therapy: { Icon: Stethoscope, className: "from-cyan-100 to-sky-200 text-cyan-900" },
  benefits: { Icon: Landmark, className: "from-emerald-100 to-lime-200 text-emerald-900" },
  legal: { Icon: Scale, className: "from-violet-100 to-purple-200 text-violet-900" },
  family_support: { Icon: UsersRound, className: "from-pink-100 to-rose-200 text-pink-900" },
  other: { Icon: BookOpen, className: "from-blue-100 to-indigo-200 text-blue-900" },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseQuery(searchParams: SearchParams): MemberResourceQuery {
  return memberResourceQuerySchema.parse({
    q: first(searchParams.q),
    category: first(searchParams.category),
    type: first(searchParams.type),
    bookmarked: first(searchParams.bookmarked),
    assigned: first(searchParams.assigned),
    featured: first(searchParams.featured),
    catalog: first(searchParams.catalog),
    page: first(searchParams.page),
  });
}

function catalogHref(query: MemberResourceQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.type) params.set("type", query.type);
  if (query.bookmarked) params.set("bookmarked", "1");
  if (query.assigned) params.set("assigned", "1");
  if (query.featured) params.set("featured", "1");
  if (
    query.catalog &&
    !query.q &&
    !query.category &&
    !query.type &&
    !query.bookmarked &&
    !query.assigned &&
    !query.featured
  ) {
    params.set("catalog", "1");
  }
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return `/member/resources${suffix ? `?${suffix}` : ""}`;
}

function ResourceGrid({
  categoryLabel,
  fallbackNotice,
  items,
  locale,
  typeLabel,
}: {
  categoryLabel: (resource: MemberResourceCard) => string;
  fallbackNotice: (resource: MemberResourceCard) => string | undefined;
  items: MemberResourceCard[];
  locale: AppLocale;
  typeLabel: (resource: MemberResourceCard) => string;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.map((resource) => (
        <MemberResourceCardView
          categoryLabel={categoryLabel(resource)}
          fallbackNotice={fallbackNotice(resource)}
          key={resource.slug}
          locale={locale}
          resource={resource}
          typeLabel={typeLabel(resource)}
        />
      ))}
    </div>
  );
}

function ResourceSection({
  categoryLabel,
  description,
  fallbackNotice,
  items,
  locale,
  sectionId,
  title,
  typeLabel,
  viewAllLabel,
  viewAllHref,
}: {
  categoryLabel: (resource: MemberResourceCard) => string;
  description: string;
  fallbackNotice: (resource: MemberResourceCard) => string | undefined;
  items: MemberResourceCard[];
  locale: AppLocale;
  sectionId: string;
  title: string;
  typeLabel: (resource: MemberResourceCard) => string;
  viewAllLabel: string;
  viewAllHref: string;
}) {
  if (!items.length) return null;
  return (
    <section className="mt-12" aria-labelledby={sectionId}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold" id={sectionId}>
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Link
          className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          href={viewAllHref}
        >
          {viewAllLabel}
        </Link>
      </div>
      <ResourceGrid
        categoryLabel={categoryLabel}
        fallbackNotice={fallbackNotice}
        items={items}
        locale={locale}
        typeLabel={typeLabel}
      />
    </section>
  );
}

export async function MemberResourceHub({
  locale,
  searchParams,
}: {
  locale: AppLocale;
  searchParams: SearchParams;
}) {
  const [t, workflow] = await Promise.all([
    getTranslations({ locale, namespace: "resources" }),
    getTranslations({ locale, namespace: "resourceWorkflow" }),
  ]);
  const query = parseQuery(searchParams);
  const isCatalogView = Boolean(
    query.catalog ||
    query.q ||
    query.category ||
    query.type ||
    query.bookmarked ||
    query.assigned ||
    query.featured ||
    query.page > 1,
  );

  const catalog = isCatalogView
    ? await getMemberResources(locale, {
        ...query,
        assignedOnly: query.assigned,
        featuredOnly: query.featured,
      })
    : null;
  const overview = !isCatalogView
    ? await Promise.all([
        getMemberResources(locale, { assignedOnly: true, pageSize: 6 }),
        getMemberResources(locale, { featuredOnly: true, pageSize: 6 }),
        getMemberResources(locale, { bookmarked: true, pageSize: 3 }),
        getMemberResources(locale, { pageSize: 6 }),
      ])
    : null;
  const categoryLabel = (resource: MemberResourceCard) => workflow(`categories.${resource.category}`);
  const typeLabel = (resource: MemberResourceCard) => t(`types.${resource.resourceType}`);
  const fallbackNotice = (resource: MemberResourceCard) => {
    const key = getResourceFallbackNoticeKey(locale, resource.usingEnglishFallback);
    return key ? workflow(key) : undefined;
  };

  return (
    <section className="mx-auto max-w-7xl">
      <header className="max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-secondary-foreground">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 font-heading text-3xl font-bold sm:text-4xl">{t("hubTitle")}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">{t("hubDescription")}</p>
      </header>

      <form className="mt-8 rounded-xl border border-border bg-white p-4 shadow-sm" method="get">
        <div className="grid gap-3 lg:grid-cols-[1fr_13rem_13rem_auto]">
          <label className="relative block">
            <span className="sr-only">{t("searchLabel")}</span>
            <Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              defaultValue={query.q}
              maxLength={100}
              name="q"
              placeholder={t("searchPlaceholder")}
              type="search"
            />
          </label>
          <label>
            <span className="sr-only">{workflow("category")}</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={query.category ?? ""}
              name="category"
            >
              <option value="">{t("allTopics")}</option>
              {resourceCategoryValues.map((category) => (
                <option key={category} value={category}>
                  {workflow(`categories.${category}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">{t("resourceType")}</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={query.type ?? ""}
              name="type"
            >
              <option value="">{t("allTypes")}</option>
              {resourceTypeValues.map((type) => (
                <option key={type} value={type}>
                  {t(`types.${type}`)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">{t("searchAction")}</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link className="font-semibold text-primary hover:underline" href="/member/resources?bookmarked=1">
            {t("myBookmarks")}
          </Link>
          {isCatalogView ? (
            <Link className="text-muted-foreground hover:underline" href="/member/resources">
              {t("clearFilters")}
            </Link>
          ) : null}
        </div>
      </form>

      {catalog ? (
        <section className="mt-10" aria-labelledby="resource-results">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold" id="resource-results">
                {query.bookmarked
                  ? t("bookmarksTitle")
                  : query.assigned
                    ? t("forYouTitle")
                    : query.featured
                      ? t("featuredTitle")
                      : t("catalogTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("resultsCount", { count: catalog.total })}
              </p>
            </div>
          </div>
          {catalog.items.length ? (
            <ResourceGrid
              categoryLabel={categoryLabel}
              fallbackNotice={fallbackNotice}
              items={catalog.items}
              locale={locale}
              typeLabel={typeLabel}
            />
          ) : (
            <p className="rounded-xl border border-border bg-white p-6 text-muted-foreground" role="status">
              {t(query.bookmarked ? "noBookmarks" : "noMatches")}
            </p>
          )}
          {catalog.totalPages > 1 ? (
            <nav aria-label={t("paginationLabel")} className="mt-8 flex items-center justify-between gap-4">
              {catalog.page > 1 ? (
                <Link
                  className="rounded-full border px-4 py-2 text-sm font-semibold"
                  href={catalogHref(query, catalog.page - 1)}
                >
                  {t("previousPage")}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted-foreground">
                {t("pageStatus", { page: catalog.page, pages: catalog.totalPages })}
              </span>
              {catalog.page < catalog.totalPages ? (
                <Link
                  className="rounded-full border px-4 py-2 text-sm font-semibold"
                  href={catalogHref(query, catalog.page + 1)}
                >
                  {t("nextPage")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      ) : null}

      {overview ? (
        <>
          <section className="mt-12" aria-labelledby="resource-topics">
            <div className="mb-5">
              <h2 className="text-2xl font-bold" id="resource-topics">
                {t("topicsTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("topicsDescription")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {resourceCategoryValues.map((category) => {
                const { Icon, className } = topicPresentation[category];
                return (
                  <Link
                    className={`group rounded-xl bg-gradient-to-br p-5 ${className}`}
                    href={`/member/resources?category=${category}`}
                    key={category}
                  >
                    <Icon aria-hidden="true" className="size-8" />
                    <span className="mt-8 block text-lg font-bold group-hover:underline">
                      {workflow(`categories.${category}`)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <ResourceSection
            categoryLabel={categoryLabel}
            description={t("forYouDescription")}
            fallbackNotice={fallbackNotice}
            items={overview[0].items}
            locale={locale}
            sectionId="resources-for-you"
            title={t("forYouTitle")}
            typeLabel={typeLabel}
            viewAllLabel={t("viewAll")}
            viewAllHref="/member/resources?assigned=1"
          />
          <ResourceSection
            categoryLabel={categoryLabel}
            description={t("featuredDescription")}
            fallbackNotice={fallbackNotice}
            items={overview[1].items}
            locale={locale}
            sectionId="resources-featured"
            title={t("featuredTitle")}
            typeLabel={typeLabel}
            viewAllLabel={t("viewAll")}
            viewAllHref="/member/resources?featured=1"
          />
          <ResourceSection
            categoryLabel={categoryLabel}
            description={t("bookmarksDescription")}
            fallbackNotice={fallbackNotice}
            items={overview[2].items}
            locale={locale}
            sectionId="resources-bookmarked"
            title={t("bookmarksTitle")}
            typeLabel={typeLabel}
            viewAllLabel={t("viewAll")}
            viewAllHref="/member/resources?bookmarked=1"
          />
          <ResourceSection
            categoryLabel={categoryLabel}
            description={t("latestDescription")}
            fallbackNotice={fallbackNotice}
            items={overview[3].items}
            locale={locale}
            sectionId="resources-latest"
            title={t("latestTitle")}
            typeLabel={typeLabel}
            viewAllLabel={t("viewAll")}
            viewAllHref="/member/resources?catalog=1"
          />

          <section className="mt-12 rounded-xl border border-border bg-secondary/40 p-6 sm:p-8">
            <BookOpen aria-hidden="true" className="size-9 text-primary" />
            <h2 className="mt-4 text-2xl font-bold">{t("trainingTitle")}</h2>
            <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">{t("rbtTrainingDescription")}</p>
            <Link
              className="mt-5 inline-flex min-h-10 items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              href="/training/rbt"
            >
              {t("rbtTrainingAction")}
            </Link>
          </section>
        </>
      ) : null}
    </section>
  );
}
