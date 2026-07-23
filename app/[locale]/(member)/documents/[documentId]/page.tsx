import { getTranslations } from "next-intl/server";
import { ArchiveDocumentButton } from "@/components/documents/archive-document-button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { formatDocumentFileSize, getDocumentFileType } from "@/lib/documents/constants";
import { getDocumentDependentName, getVisibleDocument, canArchiveDocument } from "@/lib/documents/server";
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
  const dependentName = await getDocumentDependentName(document.dependent_id);
  const isUploaded = document.upload_status === "uploaded" && !document.deleted_at;
  const canArchive =
    !document.deleted_at && document.upload_status !== "archived" && canArchiveDocument(context, document);
  const fileType = getDocumentFileType(document.mime_type);
  const statusLabel =
    document.upload_status === "uploaded"
      ? t("statusUploaded")
      : document.upload_status === "failed"
        ? t("statusFailed")
        : document.upload_status === "archived"
          ? t("statusArchived")
          : t("statusPending");
  const typeLabel =
    document.document_type === "education"
      ? t("categoryEducation")
      : document.document_type === "health"
        ? t("categoryHealth")
        : document.document_type === "legal"
          ? t("categoryLegal")
          : document.document_type === "other"
            ? t("categoryOther")
            : fileType === "pdf"
              ? t("fileTypePdf")
              : fileType === "docx"
                ? t("fileTypeDocx")
                : fileType === "txt"
                  ? t("fileTypeTxt")
                  : t("fileTypeUnknown");

  return (
    <section className="max-w-2xl">
      <Link className="text-sm font-semibold text-primary underline" href="/documents">
        {t("title")}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{document.title}</h1>
          <p className="mt-2 break-all text-muted-foreground">{document.original_filename}</p>
        </div>
        <Badge variant={document.upload_status === "failed" ? "destructive" : "secondary"}>
          {statusLabel}
        </Badge>
      </div>
      <dl className="mt-8 grid gap-4 rounded-xl border bg-white p-6 sm:grid-cols-2">
        <div>
          <dt className="font-semibold">{t("documentType")}</dt>
          <dd>{typeLabel}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("fileSize")}</dt>
          <dd>{formatDocumentFileSize(document.file_size, locale)}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("uploadDate")}</dt>
          <dd>
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(document.created_at))}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t("assignedDependent")}</dt>
          <dd>{document.dependent_id ? (dependentName ?? t("householdMember")) : t("householdLevel")}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("uploader")}</dt>
          <dd>{document.uploaded_by === context.userId ? t("you") : t("householdMember")}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("processingStatus")}</dt>
          <dd>{t("notProcessed")}</dd>
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
