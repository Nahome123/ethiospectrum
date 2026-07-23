export const DOCUMENT_BUCKET = "family-documents";

export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_FILE_TYPES = {
  pdf: {
    extension: "pdf",
    mimeType: "application/pdf",
  },
  docx: {
    extension: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  txt: {
    extension: "txt",
    mimeType: "text/plain",
  },
} as const;

export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export const DOCUMENT_ALLOWED_MIME_TYPES: readonly string[] = DOCUMENT_MIME_TYPES;

export const DOCUMENT_ALLOWED_EXTENSIONS: readonly string[] = Object.values(DOCUMENT_FILE_TYPES).map(
  ({ extension }) => extension,
);

export const DOCUMENT_CATEGORIES = ["education", "health", "legal", "other"] as const;

export const DOCUMENT_UPLOAD_STATUSES = ["pending", "uploaded", "failed", "archived"] as const;

export const DOCUMENT_PROCESSING_STATUSES = [
  "not_started",
  "processing",
  "ready",
  "failed",
  "deleted",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];
export type DocumentProcessingStatus = (typeof DOCUMENT_PROCESSING_STATUSES)[number];
export type DocumentUploadStatus = (typeof DOCUMENT_UPLOAD_STATUSES)[number];

export function getDocumentFileType(mimeType: string) {
  return Object.entries(DOCUMENT_FILE_TYPES).find(([, type]) => type.mimeType === mimeType)?.[0] ?? "unknown";
}

export function formatDocumentFileSize(bytes: number, locale: string) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(megabytes) + " MB";
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024) + " KB";
}
