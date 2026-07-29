import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import {
  roadmapCategoryValues,
  roadmapPriorityValues,
  roadmapSortValues,
  roadmapStatusValues,
} from "@/lib/roadmap/constants";
import { roadmapQueryString, type RoadmapQueryState } from "@/lib/roadmap/query-state";

export async function RoadmapFilters({
  locale,
  query,
  dependents,
  canManageArchived,
}: {
  locale: AppLocale;
  query: RoadmapQueryState;
  dependents: { id: string; label: string }[];
  canManageArchived: boolean;
}) {
  const t = await getTranslations("roadmap");
  const clearHref = `/${locale}/roadmap${query.archived ? "?archived=1" : ""}`;
  return (
    <form
      action={`/${locale}/roadmap`}
      className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input name="archived" type="hidden" value={query.archived ? "1" : "0"} />
      <label className="grid gap-1.5 text-sm font-medium" htmlFor="roadmap-filter-assignee">
        {t("assignee")}
        <select
          className="h-10 rounded-md border border-input bg-background px-3"
          defaultValue={query.assignee}
          id="roadmap-filter-assignee"
          name="assignee"
        >
          <option value="all">{t("all")}</option>
          <option value="me">{t("assignedToMe")}</option>
          <option value="unassigned">{t("unassigned")}</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium" htmlFor="roadmap-filter-status">
        {t("status")}
        <select
          className="h-10 rounded-md border border-input bg-background px-3"
          defaultValue={query.status ?? ""}
          id="roadmap-filter-status"
          name="status"
        >
          <option value="">{t("all")}</option>
          {roadmapStatusValues.map((status) => (
            <option key={status} value={status}>
              {t(`statuses.${status}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium" htmlFor="roadmap-filter-priority">
        {t("priority")}
        <select
          className="h-10 rounded-md border border-input bg-background px-3"
          defaultValue={query.priority ?? ""}
          id="roadmap-filter-priority"
          name="priority"
        >
          <option value="">{t("all")}</option>
          {roadmapPriorityValues.map((priority) => (
            <option key={priority} value={priority}>
              {t(`priorities.${priority}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium" htmlFor="roadmap-filter-category">
        {t("category")}
        <select
          className="h-10 rounded-md border border-input bg-background px-3"
          defaultValue={query.category ?? ""}
          id="roadmap-filter-category"
          name="category"
        >
          <option value="">{t("all")}</option>
          {roadmapCategoryValues.map((category) => (
            <option key={category} value={category}>
              {t(`categories.${category}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium" htmlFor="roadmap-filter-dependent">
        {t("dependent")}
        <select
          className="h-10 rounded-md border border-input bg-background px-3"
          defaultValue={query.dependent ?? ""}
          id="roadmap-filter-dependent"
          name="dependent"
        >
          <option value="">{t("all")}</option>
          {dependents.map((dependent) => (
            <option key={dependent.id} value={dependent.id}>
              {dependent.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium" htmlFor="roadmap-sort">
        {t("sort")}
        <select
          className="h-10 rounded-md border border-input bg-background px-3"
          defaultValue={query.sort}
          id="roadmap-sort"
          name="sort"
        >
          {roadmapSortValues.map((sort) => (
            <option key={sort} value={sort}>
              {t(`sorts.${sort}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-4 sm:col-span-2">
        <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
          <input defaultChecked={query.overdue} name="overdue" type="checkbox" value="1" />
          {t("overdue")}
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
          <input defaultChecked={query.completed} name="completed" type="checkbox" value="1" />
          {t("completed")}
        </label>
        <button
          className="min-h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
          type="submit"
        >
          {t("filter")}
        </button>
        <a
          className="min-h-10 rounded-md border border-border px-3 py-2 text-sm font-semibold"
          href={clearHref}
        >
          {t("clearFilters")}
        </a>
      </div>
      {canManageArchived ? (
        <a
          className="text-sm font-semibold text-primary underline underline-offset-4 sm:col-span-2"
          href={`/${locale}/roadmap${roadmapQueryString({ ...query, archived: !query.archived, page: 1 })}`}
        >
          {query.archived ? t("activeItems") : t("archivedItems")}
        </a>
      ) : null}
    </form>
  );
}
