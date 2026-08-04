import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { supportCategoryValues, supportStatusValues } from "@/lib/support/constants";
import type { SupportQueryState } from "@/lib/support/query-state";

/** Native GET form so filtering stays server-driven, shareable, and locale-preserving. */
export async function SupportFilters({
  locale,
  basePath,
  query,
}: {
  locale: AppLocale;
  basePath: string;
  query: SupportQueryState;
}) {
  const t = await getTranslations({ locale, namespace: "support" });
  return (
    <form
      action={`/${locale}${basePath}`}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4"
      method="get"
    >
      <div className="space-y-1">
        <label className="block text-sm font-semibold" htmlFor="support-status-filter">
          {t("statusFilter")}
        </label>
        <select
          className="h-10 min-w-36 rounded-md border border-input bg-background px-3"
          defaultValue={query.status ?? ""}
          id="support-status-filter"
          name="status"
        >
          <option value="">{t("allStatuses")}</option>
          {supportStatusValues.map((status) => (
            <option key={status} value={status}>
              {t(`statuses.${status}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-semibold" htmlFor="support-category-filter">
          {t("categoryFilter")}
        </label>
        <select
          className="h-10 min-w-36 rounded-md border border-input bg-background px-3"
          defaultValue={query.category ?? ""}
          id="support-category-filter"
          name="category"
        >
          <option value="">{t("allCategories")}</option>
          {supportCategoryValues.map((category) => (
            <option key={category} value={category}>
              {t(`categories.${category}`)}
            </option>
          ))}
        </select>
      </div>
      <button
        className="min-h-10 rounded-md border border-border px-4 text-sm font-semibold hover:bg-secondary"
        type="submit"
      >
        {t("applyFilters")}
      </button>
      {query.status || query.category ? (
        <Link className="min-h-10 content-center px-2 text-sm font-semibold underline" href={basePath}>
          {t("clearFilters")}
        </Link>
      ) : null}
    </form>
  );
}
