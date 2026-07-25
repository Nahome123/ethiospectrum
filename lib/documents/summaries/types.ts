import type { DocumentSummaryLanguage, DocumentSummaryProviderErrorCode } from "./constants";

export type DocumentSummarySourceCoverage = "full" | "partial";

/**
 * These IDs are server-only. Prompt construction deliberately maps them to opaque
 * source keys before any provider request is made.
 */
export type DocumentSummarySourceChunk = {
  documentId: string;
  pageId: string;
  chunkId: string | null;
  pageNumber: number;
  /** Null marks a page-only fallback source when no chunks are available. */
  chunkIndex: number | null;
  content: string;
  characterCount?: number;
};

export type DocumentSummarySelectedSource = {
  sourceKey: string;
  pageId: string;
  chunkId: string | null;
  pageNumber: number;
  chunkIndex: number | null;
  content: string;
  characterCount: number;
};

export type DocumentSummarySourceBatch = {
  index: number;
  characterCount: number;
  sources: readonly DocumentSummarySelectedSource[];
};

export type DocumentSummarySourceSelection = {
  documentId: string;
  sourceCoverage: DocumentSummarySourceCoverage;
  totalChunkCount: number;
  totalCharacterCount: number;
  selectedChunkCount: number;
  selectedCharacterCount: number;
  batches: readonly DocumentSummarySourceBatch[];
};

export type DocumentSummaryStatement = {
  text: string;
  sourceKeys: readonly string[];
};

export type DocumentSummaryImportantDate = {
  date: string;
  description: string;
  sourceKeys: readonly string[];
};

export type DocumentSummaryOrganizationOrPerson = {
  name: string;
  description: string;
  sourceKeys: readonly string[];
};

/** The stored structured result is deliberately independent of a provider SDK. */
export type DocumentSummaryOutput = {
  overview: DocumentSummaryStatement;
  keyPoints: readonly DocumentSummaryStatement[];
  importantDates: readonly DocumentSummaryImportantDate[];
  actionItems: readonly DocumentSummaryStatement[];
  organizationsOrPeople: readonly DocumentSummaryOrganizationOrPerson[];
  warningsOrUncertainties: readonly DocumentSummaryStatement[];
};

export type DocumentSummaryIntermediateSummary = {
  batchIndex: number;
  summary: DocumentSummaryOutput;
};

export type DocumentSummaryPrompt = {
  promptVersion: string;
  instructions: string;
  input: string;
};

export type DocumentSummaryPromptBuildInput =
  | {
      phase: "source_batch";
      language: DocumentSummaryLanguage;
      sourceCoverage: DocumentSummarySourceCoverage;
      batch: DocumentSummarySourceBatch;
    }
  | {
      phase: "final";
      language: DocumentSummaryLanguage;
      sourceCoverage: DocumentSummarySourceCoverage;
      intermediates: readonly DocumentSummaryIntermediateSummary[];
      /** Must be document-scoped with collectValidatedDocumentSummarySourceKeys. */
      allowedSourceKeys: readonly string[];
    };

export type DocumentSummaryProviderRequest = {
  language: DocumentSummaryLanguage;
  prompt: DocumentSummaryPrompt;
};

export type DocumentSummaryProviderResult = {
  provider: string;
  modelIdentifier: string;
  providerCallCount: number;
  structuredSummary: DocumentSummaryOutput;
};

export interface DocumentSummaryProvider {
  summarize(request: DocumentSummaryProviderRequest): Promise<DocumentSummaryProviderResult>;
}

export type DocumentSummarySourceReferenceSection =
  | "overview"
  | "keyPoints"
  | "importantDates"
  | "actionItems"
  | "organizationsOrPeople"
  | "warningsOrUncertainties";

/** A safe, server-resolved citation suitable for durable storage and protected rendering. */
export type DocumentSummaryResolvedSourceReference = {
  section: DocumentSummarySourceReferenceSection;
  itemIndex: number;
  sourceKey: string;
  pageId: string;
  chunkId: string | null;
  pageNumber: number;
  chunkIndex: number | null;
  excerpt: string;
};

export type DocumentSummaryProviderFailure = {
  code: DocumentSummaryProviderErrorCode;
  retryable: boolean;
};
