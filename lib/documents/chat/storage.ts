import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import type { DocumentChatResolvedCitation } from "./types";

export const documentChatStoredCitationSchema = z
  .object({
    reference_id: z.string().regex(/^source-[1-9][0-9]*$/),
    page_id: z.string().uuid(),
    page_number: z.number().int().positive(),
    chunk_id: z.string().uuid().nullable(),
    chunk_index: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.chunk_id === null) !== (value.chunk_index === null)) {
      context.addIssue({ code: "custom", message: "Chunk identifiers must be paired." });
    }
  });

export type DocumentChatStoredCitation = z.infer<typeof documentChatStoredCitationSchema>;

export function toStoredDocumentChatCitations(citations: readonly DocumentChatResolvedCitation[]): Json {
  return citations.map((citation, index) => ({
    reference_id: `source-${index + 1}`,
    page_id: citation.pageId,
    page_number: citation.pageNumber,
    chunk_id: citation.chunkId,
    chunk_index: citation.chunkIndex,
  }));
}

export function parseStoredDocumentChatCitations(
  value: unknown,
): readonly DocumentChatStoredCitation[] | null {
  const parsed = z.array(documentChatStoredCitationSchema).max(3).safeParse(value);
  if (
    !parsed.success ||
    new Set(parsed.data.map((citation) => citation.reference_id)).size !== parsed.data.length
  ) {
    return null;
  }
  return parsed.data;
}
