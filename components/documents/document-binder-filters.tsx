"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AppLocale } from "@/i18n/routing";
import { getDocumentBinderClearHref } from "@/lib/documents/binder-url";
import type { DocumentBinderFilters } from "@/lib/validation/document-binder";

type DependentOption = { id: string; name: string };

function selectValue(filters: DocumentBinderFilters) {
  if (filters.householdLevel) return "unassigned";
  return filters.dependentId ?? "";
}

function BinderFilterFields({
  dependents,
  filters,
  idPrefix,
}: {
  dependents: DependentOption[];
  filters: DocumentBinderFilters;
  idPrefix: string;
}) {
  const t = useTranslations("documents");
  return (
    <>
      <div className="space-y-1.5 sm:col-span-2">
        <label className="font-semibold" htmlFor={`${idPrefix}-search`}>
          {t("searchDocuments")}
        </label>
        <input
          className="flex h-10 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          defaultValue={filters.search}
          id={`${idPrefix}-search`}
          maxLength={80}
          name="q"
          placeholder={t("searchHint")}
          type="search"
        />
      </div>
      <div className="space-y-1.5">
        <label className="font-semibold" htmlFor={`${idPrefix}-dependent`}>
          {t("assignedDependent")}
        </label>
        <select
          className="flex h-10 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          defaultValue={selectValue(filters)}
          id={`${idPrefix}-dependent`}
          name="dependent"
        >
          <option value="">{t("allDependents")}</option>
          <option value="unassigned">{t("householdLevel")}</option>
          {dependents.map((dependent) => (
            <option key={dependent.id} value={dependent.id}>
              {dependent.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="font-semibold" htmlFor={`${idPrefix}-category`}>
          {t("documentCategory")}
        </label>
        <select
          className="flex h-10 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          defaultValue={filters.category ?? ""}
          id={`${idPrefix}-category`}
          name="category"
        >
          <option value="">{t("allCategories")}</option>
          <option value="education">{t("categoryEducation")}</option>
          <option value="health">{t("categoryHealth")}</option>
          <option value="legal">{t("categoryLegal")}</option>
          <option value="other">{t("categoryOther")}</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="font-semibold" htmlFor={`${idPrefix}-file-type`}>
          {t("fileType")}
        </label>
        <select
          className="flex h-10 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          defaultValue={filters.mimeType ?? ""}
          id={`${idPrefix}-file-type`}
          name="fileType"
        >
          <option value="">{t("allFileTypes")}</option>
          <option value="application/pdf">{t("fileTypePdf")}</option>
          <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
            {t("fileTypeDocx")}
          </option>
          <option value="text/plain">{t("fileTypeTxt")}</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="font-semibold" htmlFor={`${idPrefix}-upload-status`}>
          {t("uploadStatus")}
        </label>
        <select
          className="flex h-10 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          defaultValue={filters.uploadStatus ?? ""}
          id={`${idPrefix}-upload-status`}
          name="uploadStatus"
        >
          <option value="">{t("allUploadStatuses")}</option>
          <option value="pending">{t("statusPending")}</option>
          <option value="uploaded">{t("statusUploaded")}</option>
          <option value="failed">{t("statusFailed")}</option>
          <option value="archived">{t("statusArchived")}</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="font-semibold" htmlFor={`${idPrefix}-processing-status`}>
          {t("processingStatus")}
        </label>
        <select
          className="flex h-10 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          defaultValue={filters.processingStatus ?? ""}
          id={`${idPrefix}-processing-status`}
          name="processingStatus"
        >
          <option value="">{t("allProcessingStatuses")}</option>
          <option value="not_started">{t("notProcessed")}</option>
          <option value="processing">{t("processing")}</option>
          <option value="ready">{t("processingReady")}</option>
          <option value="failed">{t("processingFailed")}</option>
          <option value="deleted">{t("processingDeleted")}</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="font-semibold" htmlFor={`${idPrefix}-from`}>
          {t("dateFrom")}
        </label>
        <input
          className="flex h-10 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          defaultValue={filters.from ?? ""}
          id={`${idPrefix}-from`}
          name="from"
          type="date"
        />
      </div>
      <div className="space-y-1.5">
        <label className="font-semibold" htmlFor={`${idPrefix}-to`}>
          {t("dateTo")}
        </label>
        <input
          className="flex h-10 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          defaultValue={filters.to ?? ""}
          id={`${idPrefix}-to`}
          name="to"
          type="date"
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <label className="font-semibold" htmlFor={`${idPrefix}-sort`}>
          {t("sort")}
        </label>
        <select
          className="flex h-10 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          defaultValue={filters.sort}
          id={`${idPrefix}-sort`}
          name="sort"
        >
          <option value="newest">{t("sortNewest")}</option>
          <option value="oldest">{t("sortOldest")}</option>
          <option value="title_asc">{t("sortTitleAscending")}</option>
          <option value="title_desc">{t("sortTitleDescending")}</option>
        </select>
      </div>
    </>
  );
}

function BinderFilterForm({
  className,
  dependents,
  filters,
  idPrefix,
  locale,
}: {
  className?: string;
  dependents: DependentOption[];
  filters: DocumentBinderFilters;
  idPrefix: string;
  locale: AppLocale;
}) {
  const t = useTranslations("documents");
  return (
    <form action={`/${locale}/documents`} className={className} method="get" role="search">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">{t("filters")}</legend>
        <BinderFilterFields dependents={dependents} filters={filters} idPrefix={idPrefix} />
      </fieldset>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button className="whitespace-normal" type="submit">
          {t("applyFilters")}
        </Button>
        <a
          className="inline-flex min-h-9 items-center rounded-4xl px-3 font-semibold text-primary underline underline-offset-4"
          href={getDocumentBinderClearHref(locale)}
        >
          {t("clearFilters")}
        </a>
      </div>
    </form>
  );
}

export function DocumentBinderFilters({
  dependents,
  filters,
  locale,
}: {
  dependents: DependentOption[];
  filters: DocumentBinderFilters;
  locale: AppLocale;
}) {
  const t = useTranslations("documents");
  return (
    <>
      <BinderFilterForm
        className="hidden rounded-2xl border bg-card p-5 md:block"
        dependents={dependents}
        filters={filters}
        idPrefix="document-binder-desktop"
        locale={locale}
      />
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger render={<Button className="whitespace-normal" type="button" variant="outline" />}>
            <SlidersHorizontal aria-hidden="true" />
            {t("filters")}
          </SheetTrigger>
          <SheetContent
            className="max-h-[90vh] overflow-y-auto rounded-t-3xl"
            side="bottom"
            showCloseButton={false}
          >
            <SheetHeader>
              <SheetTitle>{t("filters")}</SheetTitle>
              <SheetDescription>{t("mobileFiltersDescription")}</SheetDescription>
            </SheetHeader>
            <div className="px-6 pb-6">
              <BinderFilterForm
                dependents={dependents}
                filters={filters}
                idPrefix="document-binder-mobile"
                locale={locale}
              />
            </div>
            <SheetFooter className="border-t">
              <SheetClose render={<Button className="whitespace-normal" type="button" variant="outline" />}>
                {t("closeFilters")}
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
