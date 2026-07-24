import { describe, expect, it, vi } from "vitest";
import { DOCUMENT_SUMMARY_PROVIDER_TIMEOUT_MS } from "@/lib/documents/summaries/constants";
import {
  createOpenAiDocumentSummaryProvider,
  type OpenAiResponsesClient,
} from "@/lib/documents/summaries/openai-provider";
import { DocumentSummaryProviderError } from "@/lib/documents/summaries/provider";

const validStructuredSummary = {
  overview: { text: "A grounded overview.", sourceKeys: ["src_001"] },
  keyPoints: [],
  importantDates: [],
  actionItems: [],
  organizationsOrPeople: [],
  warningsOrUncertainties: [],
};

function prompt() {
  return {
    language: "en" as const,
    prompt: {
      promptVersion: "document-summary-v1",
      instructions: "Controlled instructions.",
      input: '{"sources":[]}',
    },
  };
}

function fakeClient(create: ReturnType<typeof vi.fn>): OpenAiResponsesClient {
  return { responses: { create } } as unknown as OpenAiResponsesClient;
}

describe("OpenAI document summary provider", () => {
  it("uses the Responses API with strict output, no tools, private storage disabled, and bounded SDK options", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: JSON.stringify(validStructuredSummary) });
    const provider = createOpenAiDocumentSummaryProvider(
      { apiKey: "test-key", model: "configured-model" },
      fakeClient(create),
    );

    await expect(provider.summarize(prompt())).resolves.toMatchObject({
      provider: "openai",
      modelIdentifier: "configured-model",
      providerCallCount: 1,
      structuredSummary: validStructuredSummary,
    });

    const [request, options] = create.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(request).toMatchObject({
      model: "configured-model",
      instructions: "Controlled instructions.",
      input: '{"sources":[]}',
      background: false,
      store: false,
      stream: false,
      text: { format: { type: "json_schema", name: "document_summary_v1", strict: true } },
    });
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("conversation");
    expect(request).not.toHaveProperty("previous_response_id");
    expect(request).not.toHaveProperty("metadata");
    expect(options).toEqual({ maxRetries: 0, timeout: DOCUMENT_SUMMARY_PROVIDER_TIMEOUT_MS });
  });

  it("retries exactly once for a transient provider status and returns a parsed result", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce({ status: 429, message: "do not expose this" })
      .mockResolvedValueOnce({ output_text: JSON.stringify(validStructuredSummary) });
    const provider = createOpenAiDocumentSummaryProvider(
      { apiKey: "test-key", model: "configured-model" },
      fakeClient(create),
    );

    await expect(provider.summarize(prompt())).resolves.toMatchObject({ providerCallCount: 2 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry malformed structured output or expose it as a raw provider error", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: "not JSON" });
    const provider = createOpenAiDocumentSummaryProvider(
      { apiKey: "test-key", model: "configured-model" },
      fakeClient(create),
    );

    await expect(provider.summarize(prompt())).rejects.toMatchObject({
      code: "provider_invalid_response",
      retryable: false,
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("does not retry a rejected provider request", async () => {
    const create = vi.fn().mockRejectedValue({ status: 400, message: "sensitive implementation detail" });
    const provider = createOpenAiDocumentSummaryProvider(
      { apiKey: "test-key", model: "configured-model" },
      fakeClient(create),
    );

    await expect(provider.summarize(prompt())).rejects.toMatchObject({
      code: "provider_request_rejected",
      retryable: false,
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("fails closed before creating a client when provider configuration is blank", () => {
    expect(() => createOpenAiDocumentSummaryProvider({ apiKey: "", model: "configured-model" })).toThrow(
      DocumentSummaryProviderError,
    );
  });
});
