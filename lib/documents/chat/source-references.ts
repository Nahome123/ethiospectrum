import { DocumentSummarySourceReferenceError } from "../summaries/source-selection";
import type { DocumentSummarySelectedSource, DocumentSummarySourceSelection } from "../summaries/types";
import type { DocumentChatOutput, DocumentChatResolvedCitation } from "./types";

function selectedSources(
  selection: DocumentSummarySourceSelection,
): Map<string, DocumentSummarySelectedSource> {
  const sources = new Map<string, DocumentSummarySelectedSource>();
  for (const batch of selection.batches) {
    for (const source of batch.sources) {
      if (sources.has(source.sourceKey)) throw new DocumentSummarySourceReferenceError();
      sources.set(source.sourceKey, source);
    }
  }
  return sources;
}

/** Resolves provider labels only against the current document's trusted source set. */
export function resolveDocumentChatCitations(
  output: DocumentChatOutput,
  selection: DocumentSummarySourceSelection,
): readonly DocumentChatResolvedCitation[] {
  const selected = selectedSources(selection);
  return output.sourceKeys.map((sourceKey) => {
    const source = selected.get(sourceKey);
    if (!source) throw new DocumentSummarySourceReferenceError();
    return {
      sourceKey,
      pageId: source.pageId,
      chunkId: source.chunkId,
      pageNumber: source.pageNumber,
      chunkIndex: source.chunkIndex,
    };
  });
}
