import { describe, expect, it, vi } from "vitest";
import { DOCUMENT_OCR_PROVIDER_TIMEOUT_MS } from "@/lib/documents/ocr/constants";
import { createOpenAiDocumentOcrProvider, type OpenAiResponsesClient } from "@/lib/documents/ocr/provider";

function fakeClient(create: ReturnType<typeof vi.fn>): OpenAiResponsesClient {
  return { responses: { create } } as unknown as OpenAiResponsesClient;
}

describe("OpenAI document OCR provider", () => {
  it("uses an in-memory page image with no tools, no identifiers, disabled provider storage, and bounded timeouts", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: "የተቃኘ ገጽ\nResumen" });
    const provider = createOpenAiDocumentOcrProvider(
      { apiKey: "test-key", model: "configured-vision-model" },
      fakeClient(create),
    );

    await expect(
      provider.transcribePage({ imageBytes: new Uint8Array([137, 80, 78, 71]), pageNumber: 2 }),
    ).resolves.toEqual({
      provider: "openai",
      modelIdentifier: "configured-vision-model",
      text: "የተቃኘ ገጽ\nResumen",
    });

    const [request, options] = create.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(request).toMatchObject({
      model: "configured-vision-model",
      background: false,
      store: false,
      stream: false,
    });
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("conversation");
    expect(request).not.toHaveProperty("metadata");
    expect(options).toEqual({ maxRetries: 0, timeout: DOCUMENT_OCR_PROVIDER_TIMEOUT_MS });
  });

  it("does not expose provider details when a provider request fails", async () => {
    const create = vi.fn().mockRejectedValue({ status: 400, message: "do not expose provider response" });
    const provider = createOpenAiDocumentOcrProvider(
      { apiKey: "test-key", model: "configured-vision-model" },
      fakeClient(create),
    );

    await expect(
      provider.transcribePage({ imageBytes: new Uint8Array([1]), pageNumber: 1 }),
    ).rejects.toMatchObject({ code: "ocr_provider_failed" });
  });

  it("fails closed before making a provider client for incomplete configuration", () => {
    expect(() => createOpenAiDocumentOcrProvider({ apiKey: "", model: "configured-vision-model" })).toThrow(
      "ocr_unavailable",
    );
  });
});
