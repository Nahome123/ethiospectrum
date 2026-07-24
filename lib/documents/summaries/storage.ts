import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { documentSummaryOutputSchema } from "./schemas";
import type {
  DocumentSummaryOutput,
  DocumentSummaryResolvedSourceReference,
  DocumentSummarySourceReferenceSection,
} from "./types";

const sourceReferenceSectionSchema = z.enum([
  "overview",
  "keyPoints",
  "importantDates",
  "actionItems",
  "organizationsOrPeople",
  "warningsOrUncertainties",
]);

export const documentSummaryStoredSourceReferenceSchema = z
  .object({
    reference_id: z.string().regex(/^source-[1-9][0-9]*$/),
    section: sourceReferenceSectionSchema,
    item_index: z.number().int().nonnegative(),
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

export type DocumentSummaryStoredSourceReference = z.infer<typeof documentSummaryStoredSourceReferenceSchema>;

/** Converts neutral provider output into the stable, provider-independent database contract. */
export function toStoredDocumentSummary(summary: DocumentSummaryOutput): Json {
  return {
    overview: { text: summary.overview.text, sourceKeys: [...summary.overview.sourceKeys] },
    keyPoints: summary.keyPoints.map((item) => ({ text: item.text, sourceKeys: [...item.sourceKeys] })),
    importantDates: summary.importantDates.map((item) => ({
      date: item.date,
      description: item.description,
      sourceKeys: [...item.sourceKeys],
    })),
    actionItems: summary.actionItems.map((item) => ({ text: item.text, sourceKeys: [...item.sourceKeys] })),
    organizationsOrPeople: summary.organizationsOrPeople.map((item) => ({
      name: item.name,
      description: item.description,
      sourceKeys: [...item.sourceKeys],
    })),
    warningsOrUncertainties: summary.warningsOrUncertainties.map((item) => ({
      text: item.text,
      sourceKeys: [...item.sourceKeys],
    })),
  };
}

/** Parses database JSON defensively before it reaches a rendered summary panel. */
export function parseStoredDocumentSummary(value: unknown): DocumentSummaryOutput | null {
  const parsed = documentSummaryOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Server-resolved database IDs are serialized only after the provider labels are verified. */
export function toStoredDocumentSummarySourceReferences(
  references: readonly DocumentSummaryResolvedSourceReference[],
): Json {
  return references.map((reference, index) => ({
    reference_id: `source-${index + 1}`,
    section: reference.section,
    item_index: reference.itemIndex,
    page_id: reference.pageId,
    page_number: reference.pageNumber,
    chunk_id: reference.chunkId,
    chunk_index: reference.chunkIndex,
    excerpt: reference.excerpt,
  }));
}

export function parseStoredDocumentSummarySourceReferences(
  value: unknown,
): readonly DocumentSummaryStoredSourceReference[] | null {
  const parsed = z.array(documentSummaryStoredSourceReferenceSchema).max(144).safeParse(value);
  if (!parsed.success) return null;
  const identifiers = new Set<string>();
  for (const reference of parsed.data) {
    if (identifiers.has(reference.reference_id)) return null;
    identifiers.add(reference.reference_id);
  }
  return parsed.data;
}

export function sourceReferenceLabel(
  reference: Pick<DocumentSummaryStoredSourceReference, "page_number" | "chunk_index">,
): "page" | "section" {
  return reference.chunk_index === null ? "page" : "section";
}

export type { DocumentSummarySourceReferenceSection };
