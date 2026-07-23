import type { DocumentProcessingFailureCode } from "./constants";

export class DocumentProcessingError extends Error {
  readonly code: DocumentProcessingFailureCode;

  constructor(code: DocumentProcessingFailureCode) {
    super(code);
    this.name = "DocumentProcessingError";
    this.code = code;
  }
}

export function isDocumentProcessingError(error: unknown): error is DocumentProcessingError {
  return error instanceof DocumentProcessingError;
}
