export type ExtractedDocumentSection = {
  pageNumber: number;
  content: string;
};

export type ExtractedDocumentOutcome = "completed" | "unsupported" | "needs_ocr";

export type ExtractedDocument = {
  outcome: ExtractedDocumentOutcome;
  sections: ExtractedDocumentSection[];
};

export type DocumentProcessingChunk = {
  pageNumber: number;
  chunkIndex: number;
  content: string;
  characterCount: number;
  tokenEstimate: number;
};

export type DocumentProcessingPage = ExtractedDocumentSection & {
  characterCount: number;
};
