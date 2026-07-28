import "server-only";

import {
  createOpenAiStructuredProvider,
  isDocumentStructuredProviderError,
  type OpenAiResponsesClient,
} from "@/lib/documents/openai-structured-provider";
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

export type { OpenAiResponsesClient };

/**
 * The OpenAI implementation is intentionally confined to this server-only file.
 * It passes no tools, files, conversation IDs, user identifiers, or provider
 * metadata and parses only strict structured output.
 */
export function createOpenAiDocumentSummaryProvider(
  config: OpenAiDocumentSummaryProviderConfig,
  injectedClient?: OpenAiResponsesClient,
): DocumentSummaryProvider {
  let structuredProvider;
  try {
    structuredProvider = createOpenAiStructuredProvider(
      {
        ...config,
        schemaName: "document_summary_v1",
        jsonSchema: documentSummaryOutputJsonSchema,
        parseOutput: parseDocumentSummaryOutput,
        maxOutputTokens: DOCUMENT_SUMMARY_MAX_OUTPUT_TOKENS,
        maxRetries: DOCUMENT_SUMMARY_MAX_PROVIDER_RETRIES,
        timeoutMs: DOCUMENT_SUMMARY_PROVIDER_TIMEOUT_MS,
      },
      injectedClient,
    );
  } catch (error) {
    if (isDocumentStructuredProviderError(error)) {
      throw new DocumentSummaryProviderError({ code: error.code, retryable: error.retryable });
    }
    throw error;
  }

  return {
    async summarize(request: DocumentSummaryProviderRequest): Promise<DocumentSummaryProviderResult> {
      try {
        const result = await structuredProvider.generate(request.prompt);
        return {
          provider: result.provider,
          modelIdentifier: result.modelIdentifier,
          providerCallCount: result.providerCallCount,
          structuredSummary: result.output,
        };
      } catch (error) {
        if (isDocumentStructuredProviderError(error)) {
          throw new DocumentSummaryProviderError({ code: error.code, retryable: error.retryable });
        }
        if (isDocumentSummaryProviderError(error)) throw error;
        throw new DocumentSummaryProviderError({ code: "provider_request_rejected", retryable: false });
      }
    },
  };
}
