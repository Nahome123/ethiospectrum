import { getTranslations } from "next-intl/server";
import { ArchiveDocumentButton } from "@/components/documents/archive-document-button";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { formatDocumentFileSize, getDocumentFileType } from "@/lib/documents/constants";
import { canArchiveDocument, getDocumentDependentName, getVisibleDocument } from "@/lib/documents/server";
import { documentIdSchema } from "@/lib/validation/document";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; documentId: string }>;
}) {
  const { locale: localeParam, documentId } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations("documents");
  if (!documentIdSchema.safeParse(documentId).success) return <p>{t("notFound")}</p>;

  const record = await getVisibleDocument(documentId);
  if (!record) return <p>{t("notFound")}</p>;

  const { context, document } = record;
  const dependentName = await getDocumentDependentName(document.dependent_id, context.household.id);
  const isUploaded = document.upload_status === "uploaded" && !document.deleted_at;
  const canArchive =
    !document.deleted_at && document.upload_status !== "archived" && canArchiveDocument(context, document);
  const fileType = getDocumentFileType(document.mime_type);
  const typeLabel =
    fileType === "pdf"
      ? t("fileTypePdf")
      : fileType === "docx"
        ? t("fileTypeDocx")
        : fileType === "txt"
          ? t("fileTypeTxt")
          : t("fileTypeUnknown");
  const categoryLabel =
    document.document_type === "education"
      ? t("categoryEducation")
      : document.document_type === "health"
        ? t("categoryHealth")
        : document.document_type === "legal"
          ? t("categoryLegal")
          : document.document_type === "other"
            ? t("categoryOther")
            : t("noCategory");

  return (
    <section className="max-w-3xl">
      <Link className="text-sm font-semibold text-primary underline underline-offset-4" href="/documents">
        {t("backToBinder")}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-bold">{document.title}</h1>
          <p className="mt-2 break-all text-muted-foreground">{document.original_filename}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DocumentStatusBadge kind="upload" status={document.upload_status} />
          <DocumentStatusBadge kind="processing" status={document.processing_status} />
        </div>
      </div>

      <dl className="mt-8 grid gap-x-8 gap-y-5 rounded-2xl border bg-card p-6 sm:grid-cols-2">
        <div>
          <dt className="font-semibold">{t("originalFilename")}</dt>
          <dd className="mt-1 break-all">{document.original_filename}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("documentCategory")}</dt>
          <dd className="mt-1">{categoryLabel}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("fileType")}</dt>
          <dd className="mt-1">{typeLabel}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("fileSize")}</dt>
          <dd className="mt-1">{formatDocumentFileSize(document.file_size, locale)}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("uploadDate")}</dt>
          <dd className="mt-1">
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(document.created_at),
            )}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t("assignedDependent")}</dt>
          <dd className="mt-1">
            {document.dependent_id ? (dependentName ?? t("archivedFamilyMember")) : t("householdLevel")}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t("uploader")}</dt>
          <dd className="mt-1">
            {document.uploaded_by === context.userId ? t("you") : t("householdMember")}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t("uploadStatus")}</dt>
          <dd className="mt-1">
            <DocumentStatusBadge kind="upload" status={document.upload_status} />
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t("processingStatus")}</dt>
          <dd className="mt-1">
            <DocumentStatusBadge kind="processing" status={document.processing_status} />
          </dd>
        </div>
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        {isUploaded ? (
          <a
            className="rounded-4xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
            href={`/api/documents/${document.id}/download`}
          >
            {t("download")}
          </a>
        ) : null}
        {canArchive ? <ArchiveDocumentButton documentId={document.id} locale={locale} /> : null}
      </div>
    </section>
  );
}
