import { getDocumentFileType } from "@/lib/documents/constants";
import { parseStoredCitationPageNumber } from "./schemas";
import type { DocumentCitation, DocumentCitationOwnerType } from "./types";

/**
 * Normalizes persisted citations for display without exposing their internal
 * source coordinates. The evidence operation revalidates every field again.
 */
export function normalizeDocumentCitation({
  documentId,
  ownerId,
  ownerType,
  citationIndex,
  sourceNumber,
  storedCitation,
  mimeType,
  isPartialDocument,
}: {
  documentId: string;
  ownerId: string;
  ownerType: DocumentCitationOwnerType;
  citationIndex: number;
  sourceNumber: number;
  storedCitation: unknown;
  mimeType: string;
  isPartialDocument: boolean;
}): DocumentCitation {
  const pageNumber = parseStoredCitationPageNumber(storedCitation);
  const isPdf = getDocumentFileType(mimeType) === "pdf";
  const sourceKind = pageNumber === null ? null : isPdf ? "page" : "section";

  return {
    sourceNumber,
    ownerType,
    ownerId,
    citationIndex,
    documentId,
    pageNumber,
    pageStart: sourceKind === "page" ? pageNumber : null,
    pageEnd: null,
    sectionLabel: null,
    sectionNumber: sourceKind === "section" ? pageNumber : null,
    sourceKind,
    availability: pageNumber === null ? "unavailable" : "unknown",
    canOpenOriginal: sourceKind === "page",
    isPartialDocument,
  };
}
