import { describe, expect, it } from "vitest";
import { DOCUMENT_SUMMARY_MAX_SOURCE_EXCERPT_CHARACTERS } from "@/lib/documents/summaries/constants";
import {
  collectValidatedDocumentSummarySourceKeys,
  DocumentSummarySourceReferenceError,
  DocumentSummarySourceSelectionError,
  resolveDocumentSummarySourceReferences,
  selectDocumentSummarySources,
} from "@/lib/documents/summaries/source-selection";
import type { DocumentSummaryOutput, DocumentSummarySourceChunk } from "@/lib/documents/summaries/types";

const documentId = "document-one";

const chunks: DocumentSummarySourceChunk[] = [
  {
    documentId,
    pageId: "page-two",
    chunkId: "chunk-two",
    pageNumber: 2,
    chunkIndex: 0,
    content: "Segundo texto con acentos: información.",
  },
  {
    documentId,
    pageId: "page-one",
    chunkId: "chunk-one",
    pageNumber: 1,
    chunkIndex: 0,
    content: "የቤተሰብ ማስታወሻ with a source citation.",
  },
  {
    documentId,
    pageId: "page-one",
    chunkId: "chunk-three",
    pageNumber: 1,
    chunkIndex: 1,
    content: "A later logical section.",
  },
];

function summary(sourceKey = "src_001"): DocumentSummaryOutput {
  return {
    overview: { text: "A grounded overview.", sourceKeys: [sourceKey] },
    keyPoints: [],
    importantDates: [],
    actionItems: [],
    organizationsOrPeople: [],
    warningsOrUncertainties: [],
  };
}

describe("document summary source selection", () => {
  it("sorts source chunks deterministically and gives the provider only opaque source keys", () => {
    const selection = selectDocumentSummarySources(documentId, chunks);
    const sources = selection.batches.flatMap((batch) => batch.sources);

    expect(selection.sourceCoverage).toBe("full");
    expect(sources.map((source) => source.sourceKey)).toEqual(["src_001", "src_002", "src_003"]);
    expect(sources.map((source) => [source.pageNumber, source.chunkIndex])).toEqual([
      [1, 0],
      [1, 1],
      [2, 0],
    ]);
    expect(sources[0]?.content).toContain("የቤተሰብ");
    expect(sources[2]?.content).toContain("acentos");
  });

  it("supports a page-only fallback source when chunk rows are unavailable", () => {
    const selection = selectDocumentSummarySources(documentId, [
      {
        documentId,
        pageId: "page-only",
        chunkId: null,
        pageNumber: 1,
        chunkIndex: null,
        content: "A page-only extracted source.",
      },
    ]);

    expect(selection.batches[0]?.sources[0]).toMatchObject({
      sourceKey: "src_001",
      pageId: "page-only",
      chunkId: null,
      chunkIndex: null,
    });
  });

  it("uses an explicit partial marker when deterministic limits select only an initial subset", () => {
    const selection = selectDocumentSummarySources(documentId, chunks, {
      maxSourceChunks: 2,
      maxChunksPerBatch: 1,
      maxSourceBatches: 2,
    });

    expect(selection.sourceCoverage).toBe("partial");
    expect(selection.selectedChunkCount).toBe(2);
    expect(selection.totalChunkCount).toBe(3);
    expect(selection.batches).toHaveLength(2);
  });

  it("rejects chunks that do not belong to the target document", () => {
    expect(() =>
      selectDocumentSummarySources(documentId, [{ ...chunks[0]!, documentId: "another-document" }]),
    ).toThrow(DocumentSummarySourceSelectionError);
  });

  it("resolves citations only through the server-selected source map and bounds excerpts", () => {
    const longChunk = {
      ...chunks[0]!,
      content: "x".repeat(DOCUMENT_SUMMARY_MAX_SOURCE_EXCERPT_CHARACTERS + 100),
    };
    const selection = selectDocumentSummarySources(documentId, [longChunk]);
    const references = resolveDocumentSummarySourceReferences(summary(), selection);

    expect(references).toEqual([
      expect.objectContaining({
        sourceKey: "src_001",
        pageId: "page-two",
        chunkId: "chunk-two",
        pageNumber: 2,
        chunkIndex: 0,
      }),
    ]);
    expect(references[0]?.excerpt.length).toBeLessThanOrEqual(DOCUMENT_SUMMARY_MAX_SOURCE_EXCERPT_CHARACTERS);
  });

  it("rejects arbitrary model source keys instead of resolving cross-document references", () => {
    const selection = selectDocumentSummarySources(documentId, chunks);

    expect(() => resolveDocumentSummarySourceReferences(summary("src_999"), selection)).toThrow(
      DocumentSummarySourceReferenceError,
    );
  });

  it("collects only selected intermediate citations in deterministic source order", () => {
    const selection = selectDocumentSummarySources(documentId, chunks);
    const keys = collectValidatedDocumentSummarySourceKeys(
      [
        {
          ...summary("src_003"),
          keyPoints: [{ text: "Also grounded.", sourceKeys: ["src_001"] }],
        },
      ],
      selection,
    );

    expect(keys).toEqual(["src_001", "src_003"]);
  });
});
