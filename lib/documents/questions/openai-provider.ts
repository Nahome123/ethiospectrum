import "server-only";

import {
  createOpenAiStructuredProvider,
  type OpenAiResponsesClient,
} from "@/lib/documents/openai-structured-provider";
import {
  DOCUMENT_QUESTION_MAX_OUTPUT_TOKENS,
  DOCUMENT_QUESTION_MAX_PROVIDER_RETRIES,
  DOCUMENT_QUESTION_PROVIDER_TIMEOUT_MS,
} from "./constants";
import { documentQuestionOutputJsonSchema, parseDocumentQuestionOutput } from "./schemas";
import type {
  DocumentQuestionProvider,
  DocumentQuestionProviderRequest,
  DocumentQuestionProviderResult,
} from "./types";

export type OpenAiDocumentQuestionProviderConfig = { apiKey: string; model: string };
export type { OpenAiResponsesClient };

/** Q&A uses the shared Responses API boundary with a question-specific strict schema. */
export function createOpenAiDocumentQuestionProvider(
  config: OpenAiDocumentQuestionProviderConfig,
  injectedClient?: OpenAiResponsesClient,
): DocumentQuestionProvider {
  const provider = createOpenAiStructuredProvider(
    {
      ...config,
      schemaName: "document_question_v1",
      jsonSchema: documentQuestionOutputJsonSchema,
      parseOutput: parseDocumentQuestionOutput,
      maxOutputTokens: DOCUMENT_QUESTION_MAX_OUTPUT_TOKENS,
      maxRetries: DOCUMENT_QUESTION_MAX_PROVIDER_RETRIES,
      timeoutMs: DOCUMENT_QUESTION_PROVIDER_TIMEOUT_MS,
    },
    injectedClient,
  );

  return {
    async answer(request: DocumentQuestionProviderRequest): Promise<DocumentQuestionProviderResult> {
      const result = await provider.generate(request.prompt);
      return {
        provider: result.provider,
        modelIdentifier: result.modelIdentifier,
        providerCallCount: result.providerCallCount,
        answer: result.output,
      };
    },
  };
}
