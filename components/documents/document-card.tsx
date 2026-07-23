import { getTranslations } from "next-intl/server";
import { ArchiveDocumentButton } from "@/components/documents/archive-document-button";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { formatDocumentFileSize, getDocumentFileType } from "@/lib/documents/constants";
import type { DocumentBinderDocument } from "@/lib/documents/binder-query";

function documentCategoryLabel(
  category: string | null,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (category === "education") return t("categoryEducation");
  if (category === "health") return t("categoryHealth");
  if (category === "legal") return t("categoryLegal");
  if (category === "other") return t("categoryOther");
  return t("noCategory");
}

function documentFileTypeLabel(mimeType: string, t: Awaited<ReturnType<typeof getTranslations>>): string {
  const fileType = getDocumentFileType(mimeType);
  if (fileType === "pdf") return t("fileTypePdf");
  if (fileType === "docx") return t("fileTypeDocx");
  if (fileType === "txt") return t("fileTypeTxt");
  return t("fileTypeUnknown");
}

export async function DocumentCard({
  locale,
  document,
}: {
  locale: AppLocale;
  document: DocumentBinderDocument;
}) {
  const t = await getTranslations("documents");
  const isUploaded = document.upload_status === "uploaded" && !document.deleted_at;
  const isArchived = document.upload_status === "archived" || Boolean(document.deleted_at);
  const assignedName = document.dependent_id
    ? (document.dependentName ?? t("archivedFamilyMember"))
    : t("householdLevel");

  return (
    <article className="flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="break-words font-bold underline-offset-4 hover:underline"
            href={`/documents/${document.id}`}
          >
            {document.title}
          </Link>
          <p className="mt-1 break-all text-sm text-muted-foreground">{document.original_filename}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <DocumentStatusBadge kind="upload" status={document.upload_status} />
          {!isArchived ? <DocumentStatusBadge kind="processing" status={document.processing_status} /> : null}
        </div>
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold">{t("assignedDependent")}</dt>
          <dd className="mt-1 break-words">{assignedName}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("documentCategory")}</dt>
          <dd className="mt-1">{documentCategoryLabel(document.document_type, t)}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("fileType")}</dt>
          <dd className="mt-1">{documentFileTypeLabel(document.mime_type, t)}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("fileSize")}</dt>
          <dd className="mt-1">{formatDocumentFileSize(document.file_size, locale)}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("uploadDate")}</dt>
          <dd className="mt-1">
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(document.created_at))}
          </dd>
        </div>
        {!isArchived ? (
          <div>
            <dt className="font-semibold">{t("processingStatus")}</dt>
            <dd className="mt-1">
              <DocumentStatusBadge kind="processing" status={document.processing_status} />
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          className="font-semibold text-primary underline underline-offset-4"
          href={`/documents/${document.id}`}
        >
          {t("viewDetails")}
        </Link>
        {isUploaded ? (
          <a
            className="font-semibold text-primary underline underline-offset-4"
            href={`/api/documents/${document.id}/download`}
          >
            {t("download")}
          </a>
        ) : null}
        {document.canArchive ? <ArchiveDocumentButton documentId={document.id} locale={locale} /> : null}
      </div>
    </article>
  );
}
