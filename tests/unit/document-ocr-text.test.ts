import { describe, expect, it } from "vitest";
import { DOCUMENT_PROCESSING_SECTION_MAX_CHARACTERS } from "@/lib/documents/processing/constants";
import { createOcrSections, normalizeOcrText } from "@/lib/documents/ocr/text";

describe("OCR text normalization", () => {
  it("preserves Amharic and Spanish Unicode while normalizing transport artifacts", () => {
    expect(normalizeOcrText("\uFEFFየቤተሰብ\r\n\r\n\r\n\r\nResumen: atención\u0000")).toBe(
      "የቤተሰብ\n\n\nResumen: atención",
    );
  });

  it("keeps page numbers, omits blank pages honestly, and preserves page order", () => {
    expect(
      createOcrSections([
        { pageNumber: 1, text: "  " },
        { pageNumber: 2, text: "የተቃኘ ገጽ" },
        { pageNumber: 3, text: "Resumen con información" },
      ]),
    ).toEqual([
      { pageNumber: 2, content: "የተቃኘ ገጽ" },
      { pageNumber: 3, content: "Resumen con información" },
    ]);
  });

  it("rejects entirely empty or oversized OCR output instead of creating placeholder text", () => {
    expect(() => createOcrSections([{ pageNumber: 1, text: "\n\u0000" }])).toThrow("ocr_output_empty");
    expect(() =>
      createOcrSections([
        { pageNumber: 1, text: "x".repeat(DOCUMENT_PROCESSING_SECTION_MAX_CHARACTERS + 1) },
      ]),
    ).toThrow("ocr_output_too_large");
  });
});
