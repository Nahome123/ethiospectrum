import {
  DOCUMENT_PROCESSING_CHUNK_MAX_CHARACTERS,
  DOCUMENT_PROCESSING_CHUNK_OVERLAP_CHARACTERS,
  DOCUMENT_PROCESSING_MAX_CHUNKS,
  DOCUMENT_PROCESSING_MAX_EXTRACTED_CHARACTERS,
  DOCUMENT_PROCESSING_MAX_SECTIONS,
  DOCUMENT_PROCESSING_SECTION_MAX_CHARACTERS,
} from "./constants";
import { DocumentProcessingError } from "./errors";
import type { DocumentProcessingChunk, DocumentProcessingPage, ExtractedDocumentSection } from "./types";

/**
 * Normalizes transport artifacts while preserving multilingual Unicode. It does
 * not transliterate, translate, or otherwise change Amharic/Spanish content.
 */
export function normalizeExtractedText(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function ensureExtractedTextWithinLimit(sections: readonly ExtractedDocumentSection[]): void {
  const characterCount = sections.reduce((total, section) => total + section.content.length, 0);
  if (characterCount > DOCUMENT_PROCESSING_MAX_EXTRACTED_CHARACTERS) {
    throw new DocumentProcessingError("text_too_large");
  }
}

function splitLongSection(value: string, maximumLength: number): string[] {
  const sections: string[] = [];
  let remainder = value.trim();
  while (remainder.length > maximumLength) {
    const boundaryStart = Math.max(0, maximumLength - 1);
    const candidate = Math.max(
      remainder.lastIndexOf("\n", maximumLength),
      remainder.lastIndexOf(" ", maximumLength),
      remainder.lastIndexOf("\t", maximumLength),
    );
    const boundary = candidate >= boundaryStart ? candidate : maximumLength;
    const section = remainder.slice(0, boundary).trim();
    if (section) sections.push(section);
    remainder = remainder.slice(boundary).trim();
  }
  if (remainder) sections.push(remainder);
  return sections;
}

/** Builds deterministic logical sections for TXT and DOCX content. */
export function splitIntoLogicalSections(value: string): ExtractedDocumentSection[] {
  const normalized = normalizeExtractedText(value);
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const sections: string[] = [];
  let current = "";

  const commitCurrent = () => {
    if (current) sections.push(current);
    current = "";
  };

  for (const paragraph of paragraphs) {
    for (const part of splitLongSection(paragraph, DOCUMENT_PROCESSING_SECTION_MAX_CHARACTERS)) {
      const proposed = current ? `${current}\n\n${part}` : part;
      if (proposed.length > DOCUMENT_PROCESSING_SECTION_MAX_CHARACTERS && current) {
        commitCurrent();
      }
      current = current ? `${current}\n\n${part}` : part;
    }
  }
  commitCurrent();

  if (sections.length > DOCUMENT_PROCESSING_MAX_SECTIONS) {
    throw new DocumentProcessingError("text_too_large");
  }

  const result = sections.map((content, index) => ({ pageNumber: index + 1, content }));
  ensureExtractedTextWithinLimit(result);
  return result;
}

function preferredChunkBoundary(value: string, start: number, maximumEnd: number): number {
  if (maximumEnd >= value.length) return value.length;
  const candidates = [
    value.lastIndexOf("\n\n", maximumEnd),
    value.lastIndexOf("\n", maximumEnd),
    value.lastIndexOf(" ", maximumEnd),
  ];
  const minimumBoundary = start + Math.floor(DOCUMENT_PROCESSING_CHUNK_MAX_CHARACTERS / 2);
  const boundary = candidates.find((candidate) => candidate >= minimumBoundary);
  return boundary === undefined ? maximumEnd : boundary;
}

function nextChunkStart(value: string, currentStart: number, boundary: number): number {
  if (boundary >= value.length) return value.length;
  const overlapStart = Math.max(currentStart + 1, boundary - DOCUMENT_PROCESSING_CHUNK_OVERLAP_CHARACTERS);
  const whitespace = value.indexOf(" ", overlapStart);
  return whitespace > overlapStart && whitespace < boundary ? whitespace + 1 : overlapStart;
}

function estimateTokens(value: string): number {
  const words = value.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.3));
}

/**
 * Chunks remain deterministic and page-scoped. A small overlap preserves
 * context without introducing model-specific tokenization or embeddings.
 */
export function chunkDocumentSections(
  sections: readonly ExtractedDocumentSection[],
): DocumentProcessingChunk[] {
  const chunks: DocumentProcessingChunk[] = [];

  for (const section of sections) {
    const content = normalizeExtractedText(section.content);
    if (!content) continue;
    let start = 0;
    let chunkIndex = 0;

    while (start < content.length) {
      const boundary = preferredChunkBoundary(
        content,
        start,
        Math.min(content.length, start + DOCUMENT_PROCESSING_CHUNK_MAX_CHARACTERS),
      );
      const chunk = content.slice(start, boundary).trim();
      if (chunk) {
        chunks.push({
          pageNumber: section.pageNumber,
          chunkIndex,
          content: chunk,
          characterCount: chunk.length,
          tokenEstimate: estimateTokens(chunk),
        });
        chunkIndex += 1;
      }
      if (boundary >= content.length) break;
      const nextStart = nextChunkStart(content, start, boundary);
      start = nextStart > start ? nextStart : boundary;
    }
  }

  if (chunks.length > DOCUMENT_PROCESSING_MAX_CHUNKS) {
    throw new DocumentProcessingError("text_too_large");
  }
  return chunks;
}

export function toDocumentProcessingPages(
  sections: readonly ExtractedDocumentSection[],
): DocumentProcessingPage[] {
  ensureExtractedTextWithinLimit(sections);
  return sections.map((section) => ({
    pageNumber: section.pageNumber,
    content: section.content,
    characterCount: section.content.length,
  }));
}
