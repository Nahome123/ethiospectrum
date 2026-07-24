import "server-only";

import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  ConflictError,
  InternalServerError,
  RateLimitError,
} from "openai";
import {
  DOCUMENT_SUMMARY_MAX_OUTPUT_TOKENS,
  DOCUMENT_SUMMARY_MAX_PROVIDER_RETRIES,
  DOCUMENT_SUMMARY_PROVIDER_TIMEOUT_MS,
} from "./constants";
import { DocumentSummaryProviderError, isDocumentSummaryProviderError } from "./provider";
import { documentSummaryOutputJsonSchema, parseDocumentSummaryOutput } from "./schemas";
import type {
  DocumentSummaryProvider,
  DocumentSummaryProviderRequest,
  DocumentSummaryProviderResult,
} from "./types";

export type OpenAiDocumentSummaryProviderConfig = {
  apiKey: string;
  model: string;
};

export type OpenAiResponsesClient = Pick<OpenAI, "responses">;

function hasTransientStatus(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  const status = (error as { status?: unknown }).status;
  return status === 408 || status === 409 || status === 429 || (typeof status === "number" && status >= 500);
}

function toProviderError(error: unknown): DocumentSummaryProviderError {
  if (isDocumentSummaryProviderError(error)) return error;
  if (error instanceof APIConnectionTimeoutError) {
    return new DocumentSummaryProviderError({ code: "provider_timeout", retryable: true });
  }
  if (
    error instanceof APIConnectionError ||
    error instanceof ConflictError ||
    error instanceof RateLimitError ||
    error instanceof InternalServerError ||
    hasTransientStatus(error)
  ) {
    return new DocumentSummaryProviderError({ code: "provider_unavailable", retryable: true });
  }
  return new DocumentSummaryProviderError({ code: "provider_request_rejected", retryable: false });
}

function assertConfiguration(config: OpenAiDocumentSummaryProviderConfig): void {
  if (!config.apiKey.trim() || !config.model.trim()) {
    throw new DocumentSummaryProviderError({ code: "configuration_unavailable", retryable: false });
  }
}

/**
 * The OpenAI implementation is intentionally confined to this server-only file.
 * It passes no tools, files, conversation IDs, user identifiers, or provider
 * metadata and parses only strict structured output.
 */
export function createOpenAiDocumentSummaryProvider(
  config: OpenAiDocumentSummaryProviderConfig,
  injectedClient?: OpenAiResponsesClient,
): DocumentSummaryProvider {
  assertConfiguration(config);
  const client =
    injectedClient ??
    new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 0,
      timeout: DOCUMENT_SUMMARY_PROVIDER_TIMEOUT_MS,
    });

  return {
    async summarize(request: DocumentSummaryProviderRequest): Promise<DocumentSummaryProviderResult> {
      for (let attempt = 0; attempt <= DOCUMENT_SUMMARY_MAX_PROVIDER_RETRIES; attempt += 1) {
        try {
          const response = await client.responses.create(
            {
              model: config.model,
              instructions: request.prompt.instructions,
              input: request.prompt.input,
              background: false,
              store: false,
              stream: false,
              max_output_tokens: DOCUMENT_SUMMARY_MAX_OUTPUT_TOKENS,
              text: {
                format: {
                  type: "json_schema",
                  name: "document_summary_v1",
                  strict: true,
                  schema: documentSummaryOutputJsonSchema,
                },
              },
            },
            {
              maxRetries: 0,
              timeout: DOCUMENT_SUMMARY_PROVIDER_TIMEOUT_MS,
            },
          );
          let value: unknown;
          try {
            value = JSON.parse(response.output_text);
          } catch {
            throw new DocumentSummaryProviderError({ code: "provider_invalid_response", retryable: false });
          }
          const structuredSummary = parseDocumentSummaryOutput(value);
          if (!structuredSummary) {
            throw new DocumentSummaryProviderError({ code: "provider_invalid_response", retryable: false });
          }
          return {
            provider: "openai",
            modelIdentifier: config.model,
            providerCallCount: attempt + 1,
            structuredSummary,
          };
        } catch (error) {
          const safeError = toProviderError(error);
          if (!safeError.retryable || attempt === DOCUMENT_SUMMARY_MAX_PROVIDER_RETRIES) throw safeError;
        }
      }
      throw new DocumentSummaryProviderError({ code: "provider_unavailable", retryable: false });
    },
  };
}
