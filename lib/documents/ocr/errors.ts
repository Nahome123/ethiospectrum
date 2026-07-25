import type { DocumentOcrFailureCode } from "./constants";

export class DocumentOcrError extends Error {
  readonly code: DocumentOcrFailureCode;

  constructor(code: DocumentOcrFailureCode) {
    super(code);
    this.name = "DocumentOcrError";
    this.code = code;
  }
}

export function isDocumentOcrError(error: unknown): error is DocumentOcrError {
  return error instanceof DocumentOcrError;
}
