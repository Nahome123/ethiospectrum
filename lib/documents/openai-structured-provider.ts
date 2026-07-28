import "server-only";

import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  ConflictError,
  InternalServerError,
  RateLimitError,
} from "openai";

export type DocumentStructuredProviderErrorCode =
  | "configuration_unavailable"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_request_rejected"
  | "provider_invalid_response";

export class DocumentStructuredProviderError extends Error {
  readonly code: DocumentStructuredProviderErrorCode;
  readonly retryable: boolean;

  constructor({ code, retryable }: { code: DocumentStructuredProviderErrorCode; retryable: boolean }) {
    super(
      code === "provider_timeout"
        ? "Document AI generation timed out."
        : code === "provider_invalid_response"
          ? "Document AI generation returned invalid output."
          : "Document AI generation is unavailable.",
    );
    this.name = "DocumentStructuredProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function isDocumentStructuredProviderError(error: unknown): error is DocumentStructuredProviderError {
  return error instanceof DocumentStructuredProviderError;
}

export type OpenAiResponsesClient = Pick<OpenAI, "responses">;

export type OpenAiStructuredProviderConfig<TOutput> = {
  apiKey: string;
  model: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  parseOutput: (value: unknown) => TOutput | null;
  maxOutputTokens: number;
  maxRetries: number;
  timeoutMs: number;
};

export type OpenAiStructuredResult<TOutput> = {
  provider: "openai";
  modelIdentifier: string;
  providerCallCount: number;
  output: TOutput;
};

function hasTransientStatus(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  const status = (error as { status?: unknown }).status;
  return status === 408 || status === 409 || status === 429 || (typeof status === "number" && status >= 500);
}

function toProviderError(error: unknown): DocumentStructuredProviderError {
  if (isDocumentStructuredProviderError(error)) return error;
  if (error instanceof APIConnectionTimeoutError) {
    return new DocumentStructuredProviderError({ code: "provider_timeout", retryable: true });
  }
  if (
    error instanceof APIConnectionError ||
    error instanceof ConflictError ||
    error instanceof RateLimitError ||
    error instanceof InternalServerError ||
    hasTransientStatus(error)
  ) {
    return new DocumentStructuredProviderError({ code: "provider_unavailable", retryable: true });
  }
  return new DocumentStructuredProviderError({ code: "provider_request_rejected", retryable: false });
}

function assertConfiguration<TOutput>(config: OpenAiStructuredProviderConfig<TOutput>): void {
  if (!config.apiKey.trim() || !config.model.trim() || !config.schemaName.trim()) {
    throw new DocumentStructuredProviderError({ code: "configuration_unavailable", retryable: false });
  }
}

/**
 * One server-only Responses API boundary for document features. Callers supply
 * a strict schema and parser; this shared implementation never accepts tools,
 * files, conversations, metadata, browser identifiers, or provider storage.
 */
export function createOpenAiStructuredProvider<TOutput>(
  config: OpenAiStructuredProviderConfig<TOutput>,
  injectedClient?: OpenAiResponsesClient,
) {
  assertConfiguration(config);
  const client =
    injectedClient ??
    new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 0,
      timeout: config.timeoutMs,
    });

  return {
    async generate({
      instructions,
      input,
    }: {
      instructions: string;
      input: string;
    }): Promise<OpenAiStructuredResult<TOutput>> {
      for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
        try {
          const response = await client.responses.create(
            {
              model: config.model,
              instructions,
              input,
              background: false,
              store: false,
              stream: false,
              max_output_tokens: config.maxOutputTokens,
              text: {
                format: {
                  type: "json_schema",
                  name: config.schemaName,
                  strict: true,
                  schema: config.jsonSchema,
                },
              },
            },
            { maxRetries: 0, timeout: config.timeoutMs },
          );
          let value: unknown;
          try {
            value = JSON.parse(response.output_text);
          } catch {
            throw new DocumentStructuredProviderError({
              code: "provider_invalid_response",
              retryable: false,
            });
          }
          const output = config.parseOutput(value);
          if (!output) {
            throw new DocumentStructuredProviderError({
              code: "provider_invalid_response",
              retryable: false,
            });
          }
          return {
            provider: "openai",
            modelIdentifier: config.model,
            providerCallCount: attempt + 1,
            output,
          };
        } catch (error) {
          const safeError = toProviderError(error);
          if (!safeError.retryable || attempt === config.maxRetries) throw safeError;
        }
      }
      throw new DocumentStructuredProviderError({ code: "provider_unavailable", retryable: false });
    },
  };
}
