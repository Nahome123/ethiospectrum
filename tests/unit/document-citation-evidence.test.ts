import { describe, expect, it, vi } from "vitest";
import { normalizeDocumentCitation } from "@/lib/documents/citations/normalization";
import {
  documentCitationNavigationSearchSchema,
  documentCitationRequestSchema,
  isRenderableStoredCitation,
  parseStoredCitationArray,
} from "@/lib/documents/citations/schemas";
import { resolveDocumentCitationEvidence } from "@/lib/documents/citations/server";

const documentId = "30000000-0000-4000-8000-000000000003";
const ownerId = "70000000-0000-4000-8000-000000000007";

describe("document citation evidence boundary", () => {
  it("normalizes persisted metadata without sending chunk IDs or excerpts to the browser", () => {
    const citation = normalizeDocumentCitation({
      documentId,
      ownerId,
      ownerType: "document_qa_answer",
      citationIndex: 0,
      sourceNumber: 1,
      storedCitation: {
        page_number: 3,
        page_id: "60000000-0000-4000-8000-000000000006",
        chunk_id: "50000000-0000-4000-8000-000000000005",
        excerpt: "Private extracted text.",
      },
      mimeType: "application/pdf",
      isPartialDocument: false,
    });

    expect(citation).toEqual({
      sourceNumber: 1,
      ownerType: "document_qa_answer",
      ownerId,
      citationIndex: 0,
      documentId,
      pageNumber: 3,
      pageStart: 3,
      pageEnd: null,
      sectionLabel: null,
      sectionNumber: null,
      sourceKind: "page",
      availability: "unknown",
      canOpenOriginal: true,
      isPartialDocument: false,
    });
    expect(JSON.stringify(citation)).not.toContain("chunk_id");
    expect(JSON.stringify(citation)).not.toContain("Private extracted text");
  });

  it("uses logical sections and disables original-page navigation for non-PDF sources", () => {
    const citation = normalizeDocumentCitation({
      documentId,
      ownerId,
      ownerType: "document_summary",
      citationIndex: 1,
      sourceNumber: 2,
      storedCitation: { page_number: 2 },
      mimeType: "text/plain",
      isPartialDocument: true,
    });

    expect(citation.sourceKind).toBe("section");
    expect(citation.sectionNumber).toBe(2);
    expect(citation.canOpenOriginal).toBe(false);
    expect(citation.isPartialDocument).toBe(true);
  });

  it("rejects untrusted owner types, invalid IDs, oversized indexes, and oversized citation arrays", () => {
    expect(
      documentCitationRequestSchema.safeParse({
        documentId,
        ownerType: "document_chunks",
        ownerId,
        citationIndex: 0,
      }).success,
    ).toBe(false);
    expect(
      documentCitationNavigationSearchSchema.safeParse({
        citationOwner: "document_summary",
        ownerId,
        citation: "144",
      }).success,
    ).toBe(false);
    expect(parseStoredCitationArray(Array.from({ length: 145 }, () => ({})))).toEqual([]);
    expect(
      isRenderableStoredCitation({
        reference_id: "source-1",
        page_id: "60000000-0000-4000-8000-000000000006",
        page_number: 1,
        chunk_id: "50000000-0000-4000-8000-000000000005",
        chunk_index: null,
      }),
    ).toBe(false);
  });

  it("returns one generic unavailable state when the RPC denies or cannot validate a citation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await expect(
      resolveDocumentCitationEvidence(
        { rpc },
        {
          documentId,
          ownerType: "document_qa_answer",
          ownerId,
          citationIndex: 0,
        },
      ),
    ).resolves.toMatchObject({
      availability: "unavailable",
      excerpt: null,
      canOpenOriginal: false,
    });
    expect(rpc).toHaveBeenCalledWith("get_document_citation_evidence", {
      target_document_id: documentId,
      target_owner_type: "document_qa_answer",
      target_owner_id: ownerId,
      target_citation_index: 0,
    });
  });

  it("accepts only the display-safe fields returned by the evidence RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          availability: "available",
          document_name: "Meeting notes",
          source_kind: "page",
          page_number: 4,
          excerpt: "A bounded source excerpt.",
          excerpt_shortened: true,
          can_open_original: true,
          is_partial_document: false,
        },
      ],
      error: null,
    });

    await expect(
      resolveDocumentCitationEvidence(
        { rpc },
        {
          documentId,
          ownerType: "document_qa_answer",
          ownerId,
          citationIndex: 0,
        },
      ),
    ).resolves.toEqual({
      availability: "available",
      documentName: "Meeting notes",
      sourceKind: "page",
      pageNumber: 4,
      sectionNumber: null,
      excerpt: "A bounded source excerpt.",
      excerptShortened: true,
      canOpenOriginal: true,
      isPartialDocument: false,
    });
  });
});
