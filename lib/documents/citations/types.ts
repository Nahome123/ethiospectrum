import type {
  DOCUMENT_CITATION_AVAILABILITY,
  DOCUMENT_CITATION_OWNER_TYPES,
  DOCUMENT_CITATION_SOURCE_KINDS,
} from "./constants";

export type DocumentCitationOwnerType = (typeof DOCUMENT_CITATION_OWNER_TYPES)[number];
export type DocumentCitationAvailability = (typeof DOCUMENT_CITATION_AVAILABILITY)[number];
export type DocumentCitationSourceKind = (typeof DOCUMENT_CITATION_SOURCE_KINDS)[number];

/**
 * Safe metadata suitable for a rendered citation control. It deliberately
 * excludes source text, chunk IDs, storage metadata, and signed URLs.
 */
export type DocumentCitation = {
  sourceNumber: number;
  ownerType: DocumentCitationOwnerType;
  ownerId: string;
  citationIndex: number;
  documentId: string;
  pageNumber: number | null;
  pageStart: number | null;
  pageEnd: number | null;
  sectionLabel: string | null;
  sectionNumber: number | null;
  sourceKind: DocumentCitationSourceKind | null;
  availability: DocumentCitationAvailability;
  canOpenOriginal: boolean;
  isPartialDocument: boolean;
};

export type DocumentCitationEvidence = {
  availability: "available" | "unavailable";
  documentName: string | null;
  sourceKind: Exclude<DocumentCitationSourceKind, null> | null;
  pageNumber: number | null;
  sectionNumber: number | null;
  excerpt: string | null;
  excerptShortened: boolean;
  canOpenOriginal: boolean;
  isPartialDocument: boolean;
};
