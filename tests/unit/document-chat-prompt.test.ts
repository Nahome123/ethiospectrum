import { describe, expect, it } from "vitest";
import { DOCUMENT_CHAT_MAX_HISTORY_MESSAGES } from "@/lib/documents/chat/constants";
import { buildDocumentChatPrompt, getDocumentChatControlledInstructions } from "@/lib/documents/chat/prompt";
import {
  documentChatLanguageSchema,
  documentChatMessageInputSchema,
  documentChatOutputJsonSchema,
  parseDocumentChatOutput,
} from "@/lib/documents/chat/schemas";
import { resolveDocumentChatCitations } from "@/lib/documents/chat/source-references";

const selection = {
  documentId: "30000000-0000-4000-8000-000000000003",
  sourceCoverage: "full" as const,
  totalChunkCount: 1,
  totalCharacterCount: 25,
  selectedChunkCount: 1,
  selectedCharacterCount: 25,
  batches: [
    {
      index: 1,
      characterCount: 25,
      sources: [
        {
          sourceKey: "src_001",
          pageId: "60000000-0000-4000-8000-000000000006",
          chunkId: "50000000-0000-4000-8000-000000000005",
          pageNumber: 1,
          chunkIndex: 0,
          content: "Synthetic source content.",
          characterCount: 25,
        },
      ],
    },
  ],
};

describe("persistent document chat schemas and prompt", () => {
  it("accepts supported locales and multilingual bounded messages", () => {
    expect(documentChatLanguageSchema.safeParse("en").success).toBe(true);
    expect(documentChatLanguageSchema.safeParse("am").success).toBe(true);
    expect(documentChatLanguageSchema.safeParse("es").success).toBe(true);
    expect(documentChatLanguageSchema.safeParse("fr").success).toBe(false);
    expect(
      documentChatMessageInputSchema.safeParse({
        message: "á‹¨áˆ°áŠá‹± á‹‹áŠ“ á¿á‹°áˆ­áŒŽ áŠá‹?",
        idempotencyKey: "70000000-0000-4000-8000-000000000007",
      }).success,
    ).toBe(true);
    expect(
      documentChatMessageInputSchema.safeParse({
        message: "Â¿CuÃ¡l es el siguiente paso?",
        idempotencyKey: "70000000-0000-4000-8000-000000000007",
      }).success,
    ).toBe(true);
    expect(
      documentChatMessageInputSchema.safeParse({
        message: " ",
        idempotencyKey: "70000000-0000-4000-8000-000000000007",
      }).success,
    ).toBe(false);
  });

  it("requires citations for factual answers and forbids them for deterministic fallbacks", () => {
    expect(
      parseDocumentChatOutput({
        answer: "The document supports this.",
        resultType: "grounded_answer",
        sourceKeys: ["src_001"],
      }),
    ).toMatchObject({ resultType: "grounded_answer" });
    expect(
      parseDocumentChatOutput({
        answer: "I could not find enough information.",
        resultType: "insufficient_evidence",
        sourceKeys: [],
      }),
    ).toMatchObject({ resultType: "insufficient_evidence" });
    expect(
      parseDocumentChatOutput({
        answer: "Unsupported claim.",
        resultType: "grounded_answer",
        sourceKeys: [],
      }),
    ).toBeNull();
    expect(
      parseDocumentChatOutput({
        answer: "Outside document.",
        resultType: "outside_document",
        sourceKeys: ["src_001"],
      }),
    ).toBeNull();
    expect(
      parseDocumentChatOutput({
        answer: "Duplicate citations.",
        resultType: "grounded_answer",
        sourceKeys: ["src_001", "src_001"],
      }),
    ).toBeNull();
    expect(documentChatOutputJsonSchema.properties.sourceKeys).not.toHaveProperty("uniqueItems");
  });

  it("keeps bounded prior messages separate from document evidence", () => {
    const history = Array.from({ length: DOCUMENT_CHAT_MAX_HISTORY_MESSAGES }, (_, index) => ({
      role: index % 2 ? ("assistant" as const) : ("user" as const),
      content: `Context ${index + 1}`,
    }));
    const prompt = buildDocumentChatPrompt({
      language: "es",
      history,
      selection,
      sources: selection.batches[0]?.sources ?? [],
    });
    const input = JSON.parse(prompt.input) as {
      prior_conversation_context: unknown[];
      sources: Array<{ source_key: string; untrusted_document_text: string }>;
    };
    expect(input.prior_conversation_context).toHaveLength(DOCUMENT_CHAT_MAX_HISTORY_MESSAGES);
    expect(input.sources).toEqual([
      expect.objectContaining({
        source_key: "src_001",
        untrusted_document_text: "Synthetic source content.",
      }),
    ]);
    expect(getDocumentChatControlledInstructions()).toContain(
      "previous assistant messages are never evidence",
    );
    expect(getDocumentChatControlledInstructions()).toContain("untrusted data");
  });

  it("resolves only current-document source keys into structured non-excerpt citations", () => {
    expect(
      resolveDocumentChatCitations(
        { answer: "Supported.", resultType: "grounded_answer", sourceKeys: ["src_001"] },
        selection,
      ),
    ).toEqual([
      {
        sourceKey: "src_001",
        pageId: "60000000-0000-4000-8000-000000000006",
        chunkId: "50000000-0000-4000-8000-000000000005",
        pageNumber: 1,
        chunkIndex: 0,
      },
    ]);
    expect(() =>
      resolveDocumentChatCitations(
        { answer: "Fabricated.", resultType: "grounded_answer", sourceKeys: ["src_999"] },
        selection,
      ),
    ).toThrow("Document summary source references are invalid.");
  });
});
