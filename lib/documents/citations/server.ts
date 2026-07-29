import "server-only";

import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { documentCitationRequestSchema } from "./schemas";
import type { DocumentCitationEvidence } from "./types";

type CitationEvidenceClient = Pick<Awaited<ReturnType<typeof createServerActionSupabaseClient>>, "rpc">;

const unavailableEvidence: DocumentCitationEvidence = {
  availability: "unavailable",
  documentName: null,
  sourceKind: null,
  pageNumber: null,
  sectionNumber: null,
  excerpt: null,
  excerptShortened: false,
  canOpenOriginal: false,
  isPartialDocument: false,
};

/**
 * Resolves a citation through its stored owner record. The database function
 * performs the authoritative document, household, source, and page checks.
 */
export async function resolveDocumentCitationEvidence(
  supabase: CitationEvidenceClient,
  input: unknown,
): Promise<DocumentCitationEvidence> {
  const parsedInput = documentCitationRequestSchema.safeParse(input);
  if (!parsedInput.success) return unavailableEvidence;

  const { data, error } = await supabase.rpc("get_document_citation_evidence", {
    target_document_id: parsedInput.data.documentId,
    target_owner_type: parsedInput.data.ownerType,
    target_owner_id: parsedInput.data.ownerId,
    target_citation_index: parsedInput.data.citationIndex,
  });
  const evidence = data?.[0];
  if (
    error ||
    !evidence ||
    evidence.availability !== "available" ||
    !evidence.document_name ||
    !evidence.excerpt ||
    (evidence.source_kind !== "page" && evidence.source_kind !== "section") ||
    !Number.isSafeInteger(evidence.page_number) ||
    evidence.page_number < 1
  ) {
    return unavailableEvidence;
  }

  return {
    availability: "available",
    documentName: evidence.document_name,
    sourceKind: evidence.source_kind,
    pageNumber: evidence.source_kind === "page" ? evidence.page_number : null,
    sectionNumber: evidence.source_kind === "section" ? evidence.page_number : null,
    excerpt: evidence.excerpt,
    excerptShortened: evidence.excerpt_shortened === true,
    canOpenOriginal: evidence.can_open_original === true,
    isPartialDocument: evidence.is_partial_document === true,
  };
}

export function getUnavailableCitationEvidence(): DocumentCitationEvidence {
  return unavailableEvidence;
}
