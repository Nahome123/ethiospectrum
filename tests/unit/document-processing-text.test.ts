import { describe, expect, it } from "vitest";
import {
  DOCUMENT_PROCESSING_CHUNK_MAX_CHARACTERS,
  DOCUMENT_PROCESSING_MAX_EXTRACTED_CHARACTERS,
} from "@/lib/documents/processing/constants";
import { DocumentProcessingError } from "@/lib/documents/processing/errors";
import {
  chunkDocumentSections,
  ensureExtractedTextWithinLimit,
  normalizeExtractedText,
  splitIntoLogicalSections,
  toDocumentProcessingPages,
} from "@/lib/documents/processing/text";

describe("document processing text boundaries", () => {
  it("normalizes transport artifacts without changing Amharic or Spanish text", () => {
    const value = "\uFEFF\u1230\u120b\u121d\r\n\r\n\r\n\r\nFamilia\t\r\n";

    expect(normalizeExtractedText(value)).toBe("\u1230\u120b\u121d\n\n\nFamilia");
  });

  it("creates deterministic logical sections and page rows", () => {
    const content =
      "\u12e8\u1218\u1218\u132a\u12eb\u134d \u1218\u120d\u12a5\u12ad\u1275\n\nResumen de salud familiar";
    const sections = splitIntoLogicalSections(content);

    expect(sections).toEqual([{ pageNumber: 1, content }]);
    expect(toDocumentProcessingPages(sections)).toEqual([
      { pageNumber: 1, content, characterCount: content.length },
    ]);
  });

  it("keeps page-scoped chunks bounded with deterministic indices", () => {
    const content = "family planning summary ".repeat(150).trim();
    const chunks = chunkDocumentSections([{ pageNumber: 4, content }]);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.pageNumber === 4)).toBe(true);
    expect(chunks.every((chunk) => chunk.characterCount === chunk.content.length)).toBe(true);
    expect(chunks.every((chunk) => chunk.characterCount <= DOCUMENT_PROCESSING_CHUNK_MAX_CHARACTERS)).toBe(
      true,
    );
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index));
    expect(chunks.every((chunk) => chunk.tokenEstimate > 0)).toBe(true);
  });

  it("rejects extraction text that exceeds the configured safe limit", () => {
    const sections = [
      { pageNumber: 1, content: "x".repeat(DOCUMENT_PROCESSING_MAX_EXTRACTED_CHARACTERS + 1) },
    ];

    expect(() => ensureExtractedTextWithinLimit(sections)).toThrow(DocumentProcessingError);
    expect(() => ensureExtractedTextWithinLimit(sections)).toThrow("text_too_large");
  });
});
