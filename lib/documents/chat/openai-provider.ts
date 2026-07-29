import "server-only";

import {
  createOpenAiStructuredProvider,
  type OpenAiResponsesClient,
} from "@/lib/documents/openai-structured-provider";
import {
  DOCUMENT_CHAT_MAX_OUTPUT_TOKENS,
  DOCUMENT_CHAT_MAX_PROVIDER_RETRIES,
  DOCUMENT_CHAT_PROVIDER_TIMEOUT_MS,
} from "./constants";
import { documentChatOutputJsonSchema, parseDocumentChatOutput } from "./schemas";
import type { DocumentChatProvider, DocumentChatProviderRequest, DocumentChatProviderResult } from "./types";

export type OpenAiDocumentChatProviderConfig = { apiKey: string; model: string };
export type { OpenAiResponsesClient };

/** Chat uses ETH-017's server-only question-provider configuration and boundary. */
export function createOpenAiDocumentChatProvider(
  config: OpenAiDocumentChatProviderConfig,
  injectedClient?: OpenAiResponsesClient,
): DocumentChatProvider {
  const provider = createOpenAiStructuredProvider(
    {
      ...config,
      schemaName: "document_chat_v1",
      jsonSchema: documentChatOutputJsonSchema,
      parseOutput: parseDocumentChatOutput,
      maxOutputTokens: DOCUMENT_CHAT_MAX_OUTPUT_TOKENS,
      maxRetries: DOCUMENT_CHAT_MAX_PROVIDER_RETRIES,
      timeoutMs: DOCUMENT_CHAT_PROVIDER_TIMEOUT_MS,
    },
    injectedClient,
  );
  return {
    async answer(request: DocumentChatProviderRequest): Promise<DocumentChatProviderResult> {
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
