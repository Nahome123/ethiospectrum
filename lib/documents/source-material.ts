import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DocumentSummarySourceChunk } from "./summaries/types";

type DocumentSourceAdminClient = Pick<ReturnType<typeof createSupabaseAdminClient>, "from">;

export class DocumentSourceMaterialError extends Error {
  constructor() {
    super("Document source material is unavailable.");
    this.name = "DocumentSourceMaterialError";
  }
}

/**
 * Reads only a completed document's protected derivatives for a reviewed
 * server-only worker. It never returns a Storage path, user identity, or
 * source material to a browser route.
 */
export async function loadProcessedDocumentSourceChunks(
  admin: DocumentSourceAdminClient,
  { documentId, householdId }: { documentId: string; householdId: string },
): Promise<readonly DocumentSummarySourceChunk[]> {
  const [documentResult, chunksResult, pagesResult] = await Promise.all([
    admin
      .from("documents")
      .select("id, household_id, upload_status, processing_status, deleted_at")
      .eq("id", documentId)
      .maybeSingle(),
    admin
      .from("document_chunks")
      .select("id, document_id, page_id, page_number, chunk_index, content")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .order("chunk_index", { ascending: true })
      .order("id", { ascending: true }),
    admin
      .from("document_pages")
      .select("id, document_id, page_number, extracted_text")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  const document = documentResult.data;
  if (
    documentResult.error ||
    !document ||
    document.id !== documentId ||
    document.household_id !== householdId ||
    document.upload_status !== "uploaded" ||
    document.processing_status !== "completed" ||
    document.deleted_at !== null ||
    chunksResult.error ||
    pagesResult.error
  ) {
    throw new DocumentSourceMaterialError();
  }

  const pages = pagesResult.data ?? [];
  const chunks = chunksResult.data ?? [];
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const chunksCanBeSafelyCited =
    chunks.length > 0 &&
    chunks.every((chunk) => {
      if (!chunk.page_id) return false;
      const page = pagesById.get(chunk.page_id);
      return Boolean(page && page.document_id === documentId && page.page_number === chunk.page_number);
    });

  if (chunksCanBeSafelyCited) {
    return chunks.map((chunk) => ({
      documentId,
      pageId: chunk.page_id as string,
      chunkId: chunk.id,
      pageNumber: chunk.page_number,
      chunkIndex: chunk.chunk_index,
      content: chunk.content,
    }));
  }

  if (!pages.length) throw new DocumentSourceMaterialError();
  return pages.map((page) => ({
    documentId,
    pageId: page.id,
    chunkId: null,
    pageNumber: page.page_number,
    chunkIndex: null,
    content: page.extracted_text,
  }));
}
