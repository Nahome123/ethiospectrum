import { DOCUMENT_ALLOWED_EXTENSIONS } from "./constants";

const controlCharacters = /[\u0000-\u001f\u007f]/g;
const unsupportedPathCharacters = /[\\/]+/g;
const filenameCharacters = /[^a-z0-9._-]+/gi;
const repeatedDashes = /-+/g;

export function normalizeDocumentFilename(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(controlCharacters, " ")
    .replace(unsupportedPathCharacters, " ")
    .trim();
  const lastDot = normalized.lastIndexOf(".");
  const rawName = lastDot > 0 ? normalized.slice(0, lastDot) : normalized;
  const extension = lastDot > 0 ? normalized.slice(lastDot + 1).toLowerCase() : "";
  const safeName = rawName
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .normalize("NFKD")
    .replace(filenameCharacters, "")
    .replace(repeatedDashes, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 100)
    .toLowerCase();

  if (!DOCUMENT_ALLOWED_EXTENSIONS.includes(extension)) return null;
  return `${safeName || "document"}.${extension}`;
}

export function getDocumentExtension(value: string) {
  const lastDot = value.lastIndexOf(".");
  return lastDot > 0 ? value.slice(lastDot + 1).toLowerCase() : "";
}

export function buildDocumentStoragePath({
  householdId,
  dependentId,
  documentId,
  safeFilename,
}: {
  householdId: string;
  dependentId: string | null;
  documentId: string;
  safeFilename: string;
}) {
  return `households/${householdId}/dependents/${dependentId ?? "unassigned"}/documents/${documentId}/${safeFilename}`;
}
