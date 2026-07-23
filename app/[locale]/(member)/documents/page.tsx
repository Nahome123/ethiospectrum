import { getTranslations } from "next-intl/server";
import { ArchiveDocumentButton } from "@/components/documents/archive-document-button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { formatDocumentFileSize, getDocumentFileType } from "@/lib/documents/constants";
import { canArchiveDocument, getHouseholdDocuments, getUploadDependents } from "@/lib/documents/server";

export default async function DocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations("documents");
  const [{ context, documents }, { dependents }] = await Promise.all([
    getHouseholdDocuments(),
    getUploadDependents(),
  ]);
  if (!context) return <p>{t("accessDenied")}</p>;

  const statusLabel = (status: string) => {
    if (status === "uploaded") return t("statusUploaded");
    if (status === "failed") return t("statusFailed");
    if (status === "archived") return t("statusArchived");
    return t("statusPending");
  };
  const documentTypeLabel = (documentType: string | null, mimeType: string) => {
    if (documentType === "education") return t("categoryEducation");
    if (documentType === "health") return t("categoryHealth");
    if (documentType === "legal") return t("categoryLegal");
    if (documentType === "other") return t("categoryOther");
    const type = getDocumentFileType(mimeType);
    if (type === "pdf") return t("fileTypePdf");
    if (type === "docx") return t("fileTypeDocx");
    if (type === "txt") return t("fileTypeTxt");
    return t("fileTypeUnknown");
  };

  const dependentNames = new Map(
    dependents.map((dependent) => [dependent.id, dependent.preferred_name || dependent.first_name]),
  );
  const activeDocuments = documents.filter(
    (document) => !document.deleted_at && document.upload_status === "uploaded",
  );
  const incompleteDocuments = documents.filter(
    (document) => !document.deleted_at && document.upload_status !== "uploaded",
  );
  const archivedDocuments = documents.filter(
    (document) => document.deleted_at || document.upload_status === "archived",
  );

  const renderDocuments = (items: typeof documents) => (
    <ul className="mt-4 grid gap-4 lg:grid-cols-2">
      {items.map((document) => {
        const isUploaded = document.upload_status === "uploaded" && !document.deleted_at;
        return (
          <li className="rounded-xl border bg-white p-5" key={document.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link
                  className="font-bold underline-offset-4 hover:underline"
                  href={`/documents/${document.id}`}
                >
                  {document.title}
                </Link>
                <p className="mt-1 break-all text-sm text-muted-foreground">{document.original_filename}</p>
              </div>
              <Badge variant={document.upload_status === "failed" ? "destructive" : "secondary"}>
                {statusLabel(document.upload_status)}
              </Badge>
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold">{t("documentType")}</dt>
                <dd>{documentTypeLabel(document.document_type, document.mime_type)}</dd>
              </div>
              <div>
                <dt className="font-semibold">{t("fileSize")}</dt>
                <dd>{formatDocumentFileSize(document.file_size, locale)}</dd>
              </div>
              <div>
                <dt className="font-semibold">{t("assignedDependent")}</dt>
                <dd>
                  {document.dependent_id
                    ? (dependentNames.get(document.dependent_id) ?? t("householdMember"))
                    : t("householdLevel")}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">{t("uploadDate")}</dt>
                <dd>
                  {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                    new Date(document.created_at),
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">{t("processingStatus")}</dt>
                <dd>{t("notProcessed")}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              {isUploaded ? (
                <a
                  className="font-semibold text-primary underline"
                  href={`/api/documents/${document.id}/download`}
                >
                  {t("download")}
                </a>
              ) : null}
              {!document.deleted_at &&
              document.upload_status !== "archived" &&
              canArchiveDocument(context, document) ? (
                <ArchiveDocumentButton documentId={document.id} locale={locale} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t("description")}</p>
        </div>
        {context.canUpload ? (
          <Link
            className="rounded-4xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
            href="/documents/upload"
          >
            {t("uploadDocument")}
          </Link>
        ) : null}
      </div>
      {activeDocuments.length === 0 && incompleteDocuments.length === 0 && archivedDocuments.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-white p-6">
          <h2 className="font-bold">{t("emptyTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      ) : null}
      {activeDocuments.length ? (
        <section className="mt-8">
          <h2 className="text-xl font-bold">{t("activeDocuments")}</h2>
          {renderDocuments(activeDocuments)}
        </section>
      ) : null}
      {incompleteDocuments.length ? (
        <section className="mt-8">
          <h2 className="text-xl font-bold">{t("pendingUploads")}</h2>
          {renderDocuments(incompleteDocuments)}
        </section>
      ) : null}
      {archivedDocuments.length ? (
        <section className="mt-8">
          <h2 className="text-xl font-bold">{t("archivedDocuments")}</h2>
          {renderDocuments(archivedDocuments)}
        </section>
      ) : null}
    </section>
  );
}
