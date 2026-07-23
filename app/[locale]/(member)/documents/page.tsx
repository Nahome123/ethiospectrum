import { getTranslations } from "next-intl/server";
import { DocumentBinderFilters } from "@/components/documents/document-binder-filters";
import { DocumentCard } from "@/components/documents/document-card";
import { DocumentPagination } from "@/components/documents/document-pagination";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getDocumentBinderClearHref } from "@/lib/documents/binder-url";
import { getDocumentBinder } from "@/lib/documents/binder-query";
import {
  hasActiveDocumentBinderFilters,
  parseDocumentBinderSearchParams,
  type DocumentBinderSearchParams,
} from "@/lib/validation/document-binder";

function formatFileType(mimeType: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (mimeType === "application/pdf") return t("fileTypePdf");
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return t("fileTypeDocx");
  }
  if (mimeType === "text/plain") return t("fileTypeTxt");
  return t("fileTypeUnknown");
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<DocumentBinderSearchParams>;
}) {
  const [{ locale: localeParam }, rawSearchParams] = await Promise.all([params, searchParams]);
  const locale = localeParam as AppLocale;
  const t = await getTranslations("documents");
  const binder = await getDocumentBinder(parseDocumentBinderSearchParams(rawSearchParams));

  if (!binder.context) return <p>{t("binderAccessDenied")}</p>;
  if (binder.hasError) {
    return (
      <section className="max-w-2xl">
        <h1 className="text-3xl font-bold">{t("binderTitle")}</h1>
        <div className="mt-8 rounded-2xl border bg-card p-6">
          <h2 className="font-bold">{t("binderErrorTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("binderErrorDescription")}</p>
          <Link className="mt-4 inline-block font-semibold text-primary underline" href="/documents">
            {t("retry")}
          </Link>
        </div>
      </section>
    );
  }

  const activeFilterLabels: string[] = [];
  const { filters } = binder;
  if (filters.search) activeFilterLabels.push(`${t("searchDocuments")}: ${filters.search}`);
  if (filters.householdLevel) activeFilterLabels.push(t("householdLevel"));
  if (filters.dependentId) {
    const dependent = binder.dependents.find((item) => item.id === filters.dependentId);
    if (dependent) activeFilterLabels.push(`${t("assignedDependent")}: ${dependent.name}`);
  }
  if (filters.category === "education") activeFilterLabels.push(t("categoryEducation"));
  if (filters.category === "health") activeFilterLabels.push(t("categoryHealth"));
  if (filters.category === "legal") activeFilterLabels.push(t("categoryLegal"));
  if (filters.category === "other") activeFilterLabels.push(t("categoryOther"));
  if (filters.mimeType) activeFilterLabels.push(formatFileType(filters.mimeType, t));
  if (filters.uploadStatus === "pending") activeFilterLabels.push(t("statusPending"));
  if (filters.uploadStatus === "uploaded") activeFilterLabels.push(t("statusUploaded"));
  if (filters.uploadStatus === "failed") activeFilterLabels.push(t("statusFailed"));
  if (filters.uploadStatus === "archived") activeFilterLabels.push(t("statusArchived"));
  if (filters.processingStatus === "not_started") activeFilterLabels.push(t("notProcessed"));
  if (filters.processingStatus === "queued") activeFilterLabels.push(t("processingQueued"));
  if (filters.processingStatus === "processing") activeFilterLabels.push(t("processing"));
  if (filters.processingStatus === "completed") activeFilterLabels.push(t("processingCompleted"));
  if (filters.processingStatus === "failed") activeFilterLabels.push(t("processingFailed"));
  if (filters.processingStatus === "unsupported") activeFilterLabels.push(t("processingUnsupported"));
  if (filters.processingStatus === "needs_ocr") activeFilterLabels.push(t("processingNeedsOcr"));
  if (filters.from) activeFilterLabels.push(`${t("dateFrom")}: ${filters.from}`);
  if (filters.to) activeFilterLabels.push(`${t("dateTo")}: ${filters.to}`);
  if (filters.sort === "oldest") activeFilterLabels.push(t("sortOldest"));
  if (filters.sort === "title_asc") activeFilterLabels.push(t("sortTitleAscending"));
  if (filters.sort === "title_desc") activeFilterLabels.push(t("sortTitleDescending"));

  const hasFilters = hasActiveDocumentBinderFilters(filters);
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("binderTitle")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t("binderDescription")}</p>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {t("householdContext", { name: binder.context.household.name })}
          </p>
        </div>
        {binder.context.canUpload ? (
          <Link
            className="rounded-4xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
            href="/documents/upload"
          >
            {t("uploadDocument")}
          </Link>
        ) : null}
      </div>

      <div className="mt-8">
        <DocumentBinderFilters dependents={binder.dependents} filters={filters} locale={locale} />
      </div>

      <section aria-labelledby="document-results-heading" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold" id="document-results-heading">
            {t("results")}
          </h2>
          <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
            {t("resultCount", { count: binder.pagination.totalCount })}
          </p>
        </div>
        {hasFilters ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-4">
            <h3 className="font-semibold">{t("activeFilters")}</h3>
            <ul className="flex flex-wrap gap-2" aria-label={t("activeFilters")}>
              {activeFilterLabels.map((label, index) => (
                <li className="rounded-3xl border bg-background px-3 py-1 text-sm" key={`${label}-${index}`}>
                  {label}
                </li>
              ))}
            </ul>
            <Link
              className="font-semibold text-primary underline underline-offset-4"
              href={getDocumentBinderClearHref(locale)}
            >
              {t("clearFilters")}
            </Link>
          </div>
        ) : null}

        {binder.documents.length ? (
          <ul className="mt-5 grid gap-4 lg:grid-cols-2">
            {binder.documents.map((document) => (
              <li key={document.id}>
                <DocumentCard document={document} locale={locale} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 rounded-2xl border bg-card p-6">
            <h3 className="font-bold">{hasFilters ? t("noMatchingDocuments") : t("emptyTitle")}</h3>
            <p className="mt-2 max-w-xl text-muted-foreground">
              {hasFilters ? t("noMatchingDocumentsDescription") : t("emptyDescription")}
            </p>
          </div>
        )}
        <DocumentPagination filters={filters} locale={locale} pagination={binder.pagination} />
      </section>
    </section>
  );
}
