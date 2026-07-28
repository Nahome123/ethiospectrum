import { DOCUMENT_QUESTION_MAX_SOURCE_EXCERPT_CHARACTERS } from "./constants";
import type { DocumentQuestionOutput, DocumentQuestionResolvedSourceReference } from "./types";
import { DocumentSummarySourceReferenceError } from "../summaries/source-selection";
import type { DocumentSummarySelectedSource, DocumentSummarySourceSelection } from "../summaries/types";

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

/** Resolves model labels only against the current document's trusted selection. */
export function resolveDocumentQuestionSourceReferences(
  answer: DocumentQuestionOutput,
  selection: DocumentSummarySourceSelection,
): readonly DocumentQuestionResolvedSourceReference[] {
  const sources = selectedSources(selection);
  return answer.sourceKeys.map((sourceKey) => {
    const source = sources.get(sourceKey);
    if (!source) throw new DocumentSummarySourceReferenceError();
    return {
      sourceKey,
      pageId: source.pageId,
      chunkId: source.chunkId,
      pageNumber: source.pageNumber,
      chunkIndex: source.chunkIndex,
      excerpt: source.content.trim().slice(0, DOCUMENT_QUESTION_MAX_SOURCE_EXCERPT_CHARACTERS),
    };
  });
}
