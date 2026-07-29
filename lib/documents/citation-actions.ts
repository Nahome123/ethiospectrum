"use server";

import { getDocumentContext } from "@/lib/documents/server";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { resolveDocumentCitationEvidence } from "./citations/server";
import type { DocumentCitationEvidence } from "./citations/types";

/**
 * Loads a single evidence excerpt after the database resolves its stored owner
 * record. Browser-supplied page, chunk, excerpt, household, and storage data
 * are intentionally not accepted.
 */
export async function loadDocumentCitationEvidenceAction(input: unknown): Promise<DocumentCitationEvidence> {
  const context = await getDocumentContext();
  if (!context) {
    return {
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
  }
  const supabase = await createServerActionSupabaseClient();
  return resolveDocumentCitationEvidence(supabase, input);
}
