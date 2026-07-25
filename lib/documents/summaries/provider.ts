import type { DocumentSummaryProviderErrorCode } from "./constants";
import type { DocumentSummaryProviderFailure } from "./types";

export class DocumentSummaryProviderError extends Error {
  readonly code: DocumentSummaryProviderErrorCode;
  readonly retryable: boolean;

  constructor({ code, retryable }: DocumentSummaryProviderFailure) {
    super(
      code === "provider_timeout"
        ? "Document summary generation timed out."
        : code === "provider_invalid_response"
          ? "Document summary generation returned invalid output."
          : "Document summary generation is unavailable.",
    );
    this.name = "DocumentSummaryProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function isDocumentSummaryProviderError(error: unknown): error is DocumentSummaryProviderError {
  return error instanceof DocumentSummaryProviderError;
}
