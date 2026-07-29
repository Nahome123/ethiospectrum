import { z } from "zod";
import { DOCUMENT_CITATION_MAX_INDEX, DOCUMENT_CITATION_OWNER_TYPES } from "./constants";

export const documentCitationOwnerTypeSchema = z.enum(DOCUMENT_CITATION_OWNER_TYPES);

/** Only stable owner identifiers and a zero-based citation index cross the browser boundary. */
export const documentCitationRequestSchema = z
  .object({
    documentId: z.string().uuid(),
    ownerType: documentCitationOwnerTypeSchema,
    ownerId: z.string().uuid(),
    citationIndex: z.number().int().min(0).max(DOCUMENT_CITATION_MAX_INDEX),
  })
  .strict();

export const documentCitationNavigationSearchSchema = z
  .object({
    citationOwner: documentCitationOwnerTypeSchema,
    ownerId: z.string().uuid(),
    citation: z.coerce.number().int().min(0).max(DOCUMENT_CITATION_MAX_INDEX),
  })
  .strict();

const storedCitationMetadataSchema = z
  .object({
    page_number: z.number().int().positive(),
  })
  .passthrough();

const renderableStoredCitationSchema = z
  .object({
    reference_id: z.string().regex(/^source-[1-9][0-9]*$/u),
    page_id: z.string().uuid(),
    page_number: z.number().int().positive(),
    chunk_id: z.string().uuid().nullable(),
    chunk_index: z.number().int().nonnegative().nullable(),
  })
  .passthrough()
  .superRefine((citation, context) => {
    if ((citation.chunk_id === null) !== (citation.chunk_index === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chunk coordinates must be present together.",
      });
    }
  });

export function parseStoredCitationPageNumber(value: unknown): number | null {
  const parsed = storedCitationMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data.page_number : null;
}

/** A malformed persisted coordinate never becomes a browser citation control. */
export function isRenderableStoredCitation(value: unknown): boolean {
  return renderableStoredCitationSchema.safeParse(value).success;
}

export function parseStoredCitationArray(value: unknown): readonly unknown[] {
  const parsed = z
    .array(z.unknown())
    .max(DOCUMENT_CITATION_MAX_INDEX + 1)
    .safeParse(value);
  return parsed.success ? parsed.data : [];
}
