import "server-only";

import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  ConflictError,
  InternalServerError,
  RateLimitError,
} from "openai";
import { DOCUMENT_OCR_PROVIDER_TIMEOUT_MS } from "./constants";
import { DocumentOcrError, isDocumentOcrError } from "./errors";
import type { DocumentOcrProvider, OcrProviderRequest, OcrProviderResult } from "./types";

export type OpenAiDocumentOcrProviderConfig = {
  apiKey: string;
  model: string;
};

export type OpenAiResponsesClient = Pick<OpenAI, "responses">;

function hasTransientStatus(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  const status = (error as { status?: unknown }).status;
  return status === 408 || status === 409 || status === 429 || (typeof status === "number" && status >= 500);
}

function toOcrError(error: unknown): DocumentOcrError {
  if (isDocumentOcrError(error)) return error;
  if (error instanceof APIConnectionTimeoutError) return new DocumentOcrError("ocr_timeout");
  if (
    error instanceof APIConnectionError ||
    error instanceof ConflictError ||
    error instanceof RateLimitError ||
    error instanceof InternalServerError ||
    hasTransientStatus(error)
  ) {
    return new DocumentOcrError("ocr_provider_failed");
  }
  return new DocumentOcrError("ocr_provider_failed");
}

function assertConfiguration(config: OpenAiDocumentOcrProviderConfig): void {
  if (!config.apiKey.trim() || !config.model.trim()) {
    throw new DocumentOcrError("ocr_unavailable");
  }
}

function transcribePrompt(pageNumber: number): string {
  return [
    `Transcribe all readable text from scanned PDF page ${pageNumber}.`,
    "Preserve the source language, Unicode characters, line breaks, and reading order.",
    "Do not translate, summarize, interpret, correct, or add text. Return only the transcription.",
  ].join(" ");
}

/**
 * OpenAI is used only behind this server-only boundary. The request includes a
 * bounded in-memory page image, no tools or identifiers, and disables storage.
 */
export function createOpenAiDocumentOcrProvider(
  config: OpenAiDocumentOcrProviderConfig,
  injectedClient?: OpenAiResponsesClient,
): DocumentOcrProvider {
  assertConfiguration(config);
  const client =
    injectedClient ??
    new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 0,
      timeout: DOCUMENT_OCR_PROVIDER_TIMEOUT_MS,
    });

  return {
    async transcribePage(request: OcrProviderRequest): Promise<OcrProviderResult> {
      if (
        !Number.isInteger(request.pageNumber) ||
        request.pageNumber < 1 ||
        request.imageBytes.byteLength === 0
      ) {
        throw new DocumentOcrError("file_validation_failed");
      }

      try {
        const response = await client.responses.create(
          {
            model: config.model,
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: transcribePrompt(request.pageNumber) },
                  {
                    type: "input_image",
                    detail: "high",
                    image_url: `data:image/png;base64,${Buffer.from(request.imageBytes).toString("base64")}`,
                  },
                ],
              },
            ],
            background: false,
            store: false,
            stream: false,
            max_output_tokens: 4_000,
          },
          {
            maxRetries: 0,
            timeout: DOCUMENT_OCR_PROVIDER_TIMEOUT_MS,
          },
        );
        return { provider: "openai", modelIdentifier: config.model, text: response.output_text };
      } catch (error) {
        throw toOcrError(error);
      }
    },
  };
}
