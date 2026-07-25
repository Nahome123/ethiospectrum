import {
  DOCUMENT_PROCESSING_MAX_EXTRACTED_CHARACTERS,
  DOCUMENT_PROCESSING_SECTION_MAX_CHARACTERS,
} from "@/lib/documents/processing/constants";
import type { ExtractedDocumentSection } from "@/lib/documents/processing/types";
import { DocumentOcrError } from "./errors";

/** Preserves Unicode while removing only transport/control artifacts from OCR text. */
export function normalizeOcrText(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function createOcrSections(
  pages: readonly { pageNumber: number; text: string }[],
): ExtractedDocumentSection[] {
  let totalCharacters = 0;
  const sections: ExtractedDocumentSection[] = [];

  for (const page of pages) {
    const content = normalizeOcrText(page.text);
    if (!content) continue;
    if (content.length > DOCUMENT_PROCESSING_SECTION_MAX_CHARACTERS) {
      throw new DocumentOcrError("ocr_output_too_large");
    }
    totalCharacters += content.length;
    if (totalCharacters > DOCUMENT_PROCESSING_MAX_EXTRACTED_CHARACTERS) {
      throw new DocumentOcrError("ocr_output_too_large");
    }
    sections.push({ pageNumber: page.pageNumber, content });
  }

  if (!sections.length) throw new DocumentOcrError("ocr_output_empty");
  return sections;
}
