import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { buildDocumentBinderHref } from "@/lib/documents/binder-url";
import type { DocumentBinderFilters } from "@/lib/validation/document-binder";
import type { DocumentBinderPagination } from "@/lib/documents/binder-query";

export async function DocumentPagination({
  locale,
  filters,
  pagination,
}: {
  locale: AppLocale;
  filters: DocumentBinderFilters;
  pagination: DocumentBinderPagination;
}) {
  const t = await getTranslations("documents");
  if (pagination.totalPages <= 1) return null;

  return (
    <nav aria-label={t("pagination")} className="mt-8 flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        {t("pageInformation", { page: pagination.page, total: pagination.totalPages })}
      </p>
      <div className="flex items-center gap-3">
        {pagination.hasPreviousPage ? (
          <a
            className="rounded-4xl border px-4 py-2 font-semibold text-primary underline-offset-4 hover:underline"
            href={buildDocumentBinderHref(locale, filters, { page: pagination.page - 1 })}
          >
            {t("previousPage")}
          </a>
        ) : (
          <span aria-disabled="true" className="rounded-4xl border px-4 py-2 text-muted-foreground">
            {t("previousPage")}
          </span>
        )}
        {pagination.hasNextPage ? (
          <a
            className="rounded-4xl border px-4 py-2 font-semibold text-primary underline-offset-4 hover:underline"
            href={buildDocumentBinderHref(locale, filters, { page: pagination.page + 1 })}
          >
            {t("nextPage")}
          </a>
        ) : (
          <span aria-disabled="true" className="rounded-4xl border px-4 py-2 text-muted-foreground">
            {t("nextPage")}
          </span>
        )}
      </div>
    </nav>
  );
}
