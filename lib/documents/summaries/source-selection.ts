import {
  DOCUMENT_SUMMARY_MAX_CHARACTERS_PER_BATCH,
  DOCUMENT_SUMMARY_MAX_CHUNKS_PER_BATCH,
  DOCUMENT_SUMMARY_MAX_SOURCE_BATCHES,
  DOCUMENT_SUMMARY_MAX_SOURCE_CHARACTERS,
  DOCUMENT_SUMMARY_MAX_SOURCE_CHUNKS,
  DOCUMENT_SUMMARY_MAX_SOURCE_EXCERPT_CHARACTERS,
} from "./constants";
import type {
  DocumentSummaryOutput,
  DocumentSummaryResolvedSourceReference,
  DocumentSummarySelectedSource,
  DocumentSummarySourceBatch,
  DocumentSummarySourceChunk,
  DocumentSummarySourceReferenceSection,
  DocumentSummarySourceSelection,
} from "./types";

export class DocumentSummarySourceSelectionError extends Error {
  constructor() {
    super("Document summary source material is unavailable.");
    this.name = "DocumentSummarySourceSelectionError";
  }
}

export class DocumentSummarySourceReferenceError extends Error {
  constructor() {
    super("Document summary source references are invalid.");
    this.name = "DocumentSummarySourceReferenceError";
  }
}

export type DocumentSummarySourceSelectionOptions = {
  maxSourceChunks?: number;
  maxSourceCharacters?: number;
  maxChunksPerBatch?: number;
  maxCharactersPerBatch?: number;
  maxSourceBatches?: number;
};

type SourceSelectionLimits = Required<DocumentSummarySourceSelectionOptions>;

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function getLimits(options: DocumentSummarySourceSelectionOptions): SourceSelectionLimits {
  const limits: SourceSelectionLimits = {
    maxSourceChunks: options.maxSourceChunks ?? DOCUMENT_SUMMARY_MAX_SOURCE_CHUNKS,
    maxSourceCharacters: options.maxSourceCharacters ?? DOCUMENT_SUMMARY_MAX_SOURCE_CHARACTERS,
    maxChunksPerBatch: options.maxChunksPerBatch ?? DOCUMENT_SUMMARY_MAX_CHUNKS_PER_BATCH,
    maxCharactersPerBatch: options.maxCharactersPerBatch ?? DOCUMENT_SUMMARY_MAX_CHARACTERS_PER_BATCH,
    maxSourceBatches: options.maxSourceBatches ?? DOCUMENT_SUMMARY_MAX_SOURCE_BATCHES,
  };
  if (Object.values(limits).some((value) => !isPositiveSafeInteger(value))) {
    throw new DocumentSummarySourceSelectionError();
  }
  return limits;
}

function validateSourceChunk(source: DocumentSummarySourceChunk, documentId: string): void {
  const isPageOnly = source.chunkId === null && source.chunkIndex === null;
  const isChunk =
    Boolean(source.chunkId) && Number.isSafeInteger(source.chunkIndex) && (source.chunkIndex as number) >= 0;
  if (
    source.documentId !== documentId ||
    !source.pageId ||
    !Number.isSafeInteger(source.pageNumber) ||
    source.pageNumber < 1 ||
    (!isPageOnly && !isChunk) ||
    !source.content.trim() ||
    (source.characterCount !== undefined && source.characterCount !== source.content.length)
  ) {
    throw new DocumentSummarySourceSelectionError();
  }
}

function compareSources(left: DocumentSummarySourceChunk, right: DocumentSummarySourceChunk): number {
  return (
    left.pageNumber - right.pageNumber ||
    (left.chunkIndex ?? -1) - (right.chunkIndex ?? -1) ||
    (left.chunkId ?? left.pageId).localeCompare(right.chunkId ?? right.pageId)
  );
}

function sourceExcerpt(content: string): string {
  return content.trim().slice(0, DOCUMENT_SUMMARY_MAX_SOURCE_EXCERPT_CHARACTERS);
}

/**
 * Selects the earliest chunks deterministically. When a bounded subset is used,
 * callers receive an explicit `partial` coverage marker instead of a silent drop.
 */
export function selectDocumentSummarySources(
  documentId: string,
  sourceChunks: readonly DocumentSummarySourceChunk[],
  options: DocumentSummarySourceSelectionOptions = {},
): DocumentSummarySourceSelection {
  if (!documentId || sourceChunks.length === 0) throw new DocumentSummarySourceSelectionError();

  const limits = getLimits(options);
  const ordered = [...sourceChunks].sort(compareSources);
  const seenCoordinates = new Set<string>();
  let totalCharacterCount = 0;
  for (const source of ordered) {
    validateSourceChunk(source, documentId);
    const coordinate = source.chunkId
      ? `chunk:${source.pageNumber}:${source.chunkIndex}`
      : `page:${source.pageNumber}:${source.pageId}`;
    if (seenCoordinates.has(coordinate)) throw new DocumentSummarySourceSelectionError();
    seenCoordinates.add(coordinate);
    totalCharacterCount += source.content.length;
  }

  const batches: DocumentSummarySourceBatch[] = [];
  let batchSources: DocumentSummarySelectedSource[] = [];
  let batchCharacterCount = 0;
  let selectedCharacterCount = 0;
  let selectedChunkCount = 0;

  const pushCurrentBatch = () => {
    if (!batchSources.length) return;
    batches.push({
      index: batches.length + 1,
      characterCount: batchCharacterCount,
      sources: batchSources,
    });
    batchSources = [];
    batchCharacterCount = 0;
  };

  for (const source of ordered) {
    const characterCount = source.content.length;
    if (characterCount > limits.maxCharactersPerBatch || characterCount > limits.maxSourceCharacters) {
      throw new DocumentSummarySourceSelectionError();
    }
    if (
      selectedChunkCount >= limits.maxSourceChunks ||
      selectedCharacterCount + characterCount > limits.maxSourceCharacters
    ) {
      break;
    }

    const wouldOverflowBatch =
      batchSources.length > 0 &&
      (batchSources.length >= limits.maxChunksPerBatch ||
        batchCharacterCount + characterCount > limits.maxCharactersPerBatch);
    if (wouldOverflowBatch) pushCurrentBatch();
    if (batches.length >= limits.maxSourceBatches) break;

    const sourceKey = `src_${String(selectedChunkCount + 1).padStart(3, "0")}`;
    batchSources.push({
      sourceKey,
      pageId: source.pageId,
      chunkId: source.chunkId,
      pageNumber: source.pageNumber,
      chunkIndex: source.chunkIndex,
      content: source.content,
      characterCount,
    });
    selectedChunkCount += 1;
    selectedCharacterCount += characterCount;
    batchCharacterCount += characterCount;
  }
  pushCurrentBatch();

  if (!batches.length) throw new DocumentSummarySourceSelectionError();
  return {
    documentId,
    sourceCoverage: selectedChunkCount === ordered.length ? "full" : "partial",
    totalChunkCount: ordered.length,
    totalCharacterCount,
    selectedChunkCount,
    selectedCharacterCount,
    batches,
  };
}

function flattenSelectedSources(
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

function appendStatementReferences({
  references,
  selectedSources,
  section,
  itemIndex,
  sourceKeys,
}: {
  references: DocumentSummaryResolvedSourceReference[];
  selectedSources: ReadonlyMap<string, DocumentSummarySelectedSource>;
  section: DocumentSummarySourceReferenceSection;
  itemIndex: number;
  sourceKeys: readonly string[];
}): void {
  for (const sourceKey of sourceKeys) {
    const source = selectedSources.get(sourceKey);
    if (!source) throw new DocumentSummarySourceReferenceError();
    references.push({
      section,
      itemIndex,
      sourceKey,
      pageId: source.pageId,
      chunkId: source.chunkId,
      pageNumber: source.pageNumber,
      chunkIndex: source.chunkIndex,
      excerpt: sourceExcerpt(source.content),
    });
  }
}

/**
 * Resolves only model-provided opaque source keys against a selection generated
 * for this document. Database identifiers never appear in the provider prompt.
 */
export function resolveDocumentSummarySourceReferences(
  summary: DocumentSummaryOutput,
  selection: DocumentSummarySourceSelection,
): readonly DocumentSummaryResolvedSourceReference[] {
  const selectedSources = flattenSelectedSources(selection);
  const references: DocumentSummaryResolvedSourceReference[] = [];
  appendStatementReferences({
    references,
    selectedSources,
    section: "overview",
    itemIndex: 0,
    sourceKeys: summary.overview.sourceKeys,
  });
  summary.keyPoints.forEach((item, itemIndex) =>
    appendStatementReferences({
      references,
      selectedSources,
      section: "keyPoints",
      itemIndex,
      sourceKeys: item.sourceKeys,
    }),
  );
  summary.importantDates.forEach((item, itemIndex) =>
    appendStatementReferences({
      references,
      selectedSources,
      section: "importantDates",
      itemIndex,
      sourceKeys: item.sourceKeys,
    }),
  );
  summary.actionItems.forEach((item, itemIndex) =>
    appendStatementReferences({
      references,
      selectedSources,
      section: "actionItems",
      itemIndex,
      sourceKeys: item.sourceKeys,
    }),
  );
  summary.organizationsOrPeople.forEach((item, itemIndex) =>
    appendStatementReferences({
      references,
      selectedSources,
      section: "organizationsOrPeople",
      itemIndex,
      sourceKeys: item.sourceKeys,
    }),
  );
  summary.warningsOrUncertainties.forEach((item, itemIndex) =>
    appendStatementReferences({
      references,
      selectedSources,
      section: "warningsOrUncertainties",
      itemIndex,
      sourceKeys: item.sourceKeys,
    }),
  );
  return references;
}

function appendSummarySourceKeys(summary: DocumentSummaryOutput, keys: Set<string>): void {
  for (const sourceKey of summary.overview.sourceKeys) keys.add(sourceKey);
  for (const item of summary.keyPoints) for (const sourceKey of item.sourceKeys) keys.add(sourceKey);
  for (const item of summary.importantDates) for (const sourceKey of item.sourceKeys) keys.add(sourceKey);
  for (const item of summary.actionItems) for (const sourceKey of item.sourceKeys) keys.add(sourceKey);
  for (const item of summary.organizationsOrPeople)
    for (const sourceKey of item.sourceKeys) keys.add(sourceKey);
  for (const item of summary.warningsOrUncertainties)
    for (const sourceKey of item.sourceKeys) keys.add(sourceKey);
}

/**
 * Returns only selected, source-grounded keys in document order. The final
 * consolidation prompt can use this to exclude sources no intermediate summary
 * cited, while an arbitrary or cross-document key fails closed.
 */
export function collectValidatedDocumentSummarySourceKeys(
  summaries: readonly DocumentSummaryOutput[],
  selection: DocumentSummarySourceSelection,
): readonly string[] {
  const selectedSources = flattenSelectedSources(selection);
  const citedKeys = new Set<string>();
  for (const summary of summaries) appendSummarySourceKeys(summary, citedKeys);
  for (const sourceKey of citedKeys) {
    if (!selectedSources.has(sourceKey)) throw new DocumentSummarySourceReferenceError();
  }
  return [...selectedSources.keys()].filter((sourceKey) => citedKeys.has(sourceKey));
}
