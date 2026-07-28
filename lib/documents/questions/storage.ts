import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import type { DocumentQuestionResolvedSourceReference } from "./types";

export const documentQuestionStoredSourceReferenceSchema = z
  .object({
    reference_id: z.string().regex(/^source-[1-9][0-9]*$/),
    page_id: z.string().uuid(),
    page_number: z.number().int().positive(),
    chunk_id: z.string().uuid().nullable(),
    chunk_index: z.number().int().nonnegative().nullable(),
    excerpt: z.string().trim().min(1).max(320),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.chunk_id === null) !== (value.chunk_index === null)) {
      context.addIssue({ code: "custom", message: "Chunk identifiers must be paired." });
    }
  });

export type DocumentQuestionStoredSourceReference = z.infer<
  typeof documentQuestionStoredSourceReferenceSchema
>;

export function toStoredDocumentQuestionSourceReferences(
  references: readonly DocumentQuestionResolvedSourceReference[],
): Json {
  return references.map((reference, index) => ({
    reference_id: `source-${index + 1}`,
    page_id: reference.pageId,
    page_number: reference.pageNumber,
    chunk_id: reference.chunkId,
    chunk_index: reference.chunkIndex,
    excerpt: reference.excerpt,
  }));
}

export function parseStoredDocumentQuestionSourceReferences(
  value: unknown,
): readonly DocumentQuestionStoredSourceReference[] | null {
  const parsed = z.array(documentQuestionStoredSourceReferenceSchema).min(1).max(3).safeParse(value);
  if (
    !parsed.success ||
    new Set(parsed.data.map((reference) => reference.reference_id)).size !== parsed.data.length
  ) {
    return null;
  }
  return parsed.data;
}
