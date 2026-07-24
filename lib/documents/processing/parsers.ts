import "server-only";

import { Buffer } from "node:buffer";
import {
  DOCUMENT_PROCESSING_DOCX_MAX_COMPRESSION_RATIO,
  DOCUMENT_PROCESSING_DOCX_MAX_ENTRIES,
  DOCUMENT_PROCESSING_DOCX_MAX_UNCOMPRESSED_BYTES,
  DOCUMENT_PROCESSING_MAX_FILE_BYTES,
} from "./constants";
import { DocumentProcessingError, isDocumentProcessingError } from "./errors";
import { ensureExtractedTextWithinLimit, normalizeExtractedText, splitIntoLogicalSections } from "./text";
import type { ExtractedDocument } from "./types";

const PDF_MIME_TYPE = "application/pdf";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXT_MIME_TYPE = "text/plain";
const docxExtension = ".docx";
const pdfExtension = ".pdf";
const textExtension = ".txt";

function expectedExtensionForMimeType(mimeType: string): string | null {
  if (mimeType === PDF_MIME_TYPE) return pdfExtension;
  if (mimeType === DOCX_MIME_TYPE) return docxExtension;
  if (mimeType === TEXT_MIME_TYPE) return textExtension;
  return null;
}

function assertTrustedFileInput({
  bytes,
  filename,
  mimeType,
}: {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}) {
  const extension = expectedExtensionForMimeType(mimeType);
  if (
    !extension ||
    !filename.toLowerCase().endsWith(extension) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > DOCUMENT_PROCESSING_MAX_FILE_BYTES
  ) {
    throw new DocumentProcessingError("file_validation_failed");
  }
}

function looksLikeBinaryText(bytes: Uint8Array): boolean {
  let controlCharacters = 0;
  for (const byte of bytes) {
    if (byte === 0 || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)) {
      controlCharacters += 1;
    }
  }
  return controlCharacters > 0 && controlCharacters / bytes.byteLength > 0.01;
}

function assertPdfHeader(bytes: Uint8Array): void {
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  const searchLimit = Math.min(1_024, bytes.byteLength - signature.length + 1);
  for (let offset = 0; offset < searchLimit; offset += 1) {
    if (signature.every((byte, index) => bytes[offset + index] === byte)) return;
  }
  throw new DocumentProcessingError("file_validation_failed");
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset + 2 > bytes.byteLength) throw new DocumentProcessingError("file_validation_failed");
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.byteLength) throw new DocumentProcessingError("file_validation_failed");
  return (
    (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>>
    0
  );
}

/**
 * DOCX is a ZIP archive. Before Mammoth opens it, inspect its central directory
 * to cap entry count, declared decompressed size, and compression ratio.
 */
function assertSafeDocxArchive(bytes: Uint8Array): void {
  if (bytes.byteLength < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new DocumentProcessingError("file_validation_failed");
  }

  const minimumOffset = Math.max(0, bytes.byteLength - 65_557);
  let endOfCentralDirectory = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  if (endOfCentralDirectory < 0) throw new DocumentProcessingError("file_validation_failed");

  const entryCount = readUint16(bytes, endOfCentralDirectory + 10);
  const centralDirectorySize = readUint32(bytes, endOfCentralDirectory + 12);
  let cursor = readUint32(bytes, endOfCentralDirectory + 16);
  const centralDirectoryEnd = cursor + centralDirectorySize;
  if (
    entryCount === 0xffff ||
    cursor === 0xffffffff ||
    centralDirectorySize === 0xffffffff ||
    entryCount > DOCUMENT_PROCESSING_DOCX_MAX_ENTRIES ||
    centralDirectoryEnd > bytes.byteLength
  ) {
    throw new DocumentProcessingError("file_validation_failed");
  }

  let totalCompressed = 0;
  let totalUncompressed = 0;
  let hasDocumentXml = false;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > centralDirectoryEnd ||
      bytes[cursor] !== 0x50 ||
      bytes[cursor + 1] !== 0x4b ||
      bytes[cursor + 2] !== 0x01 ||
      bytes[cursor + 3] !== 0x02
    ) {
      throw new DocumentProcessingError("file_validation_failed");
    }
    const compressedSize = readUint32(bytes, cursor + 20);
    const uncompressedSize = readUint32(bytes, cursor + 24);
    const filenameLength = readUint16(bytes, cursor + 28);
    const extraLength = readUint16(bytes, cursor + 30);
    const commentLength = readUint16(bytes, cursor + 32);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + filenameLength;
    if (nameEnd > centralDirectoryEnd) throw new DocumentProcessingError("file_validation_failed");
    let name: string;
    try {
      name = decoder.decode(bytes.slice(nameStart, nameEnd));
    } catch {
      throw new DocumentProcessingError("file_validation_failed");
    }
    hasDocumentXml ||= name === "word/document.xml";
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    cursor = nameEnd + extraLength + commentLength;
  }

  if (
    cursor !== centralDirectoryEnd ||
    !hasDocumentXml ||
    totalUncompressed > DOCUMENT_PROCESSING_DOCX_MAX_UNCOMPRESSED_BYTES ||
    (totalCompressed > 0 &&
      totalUncompressed / totalCompressed > DOCUMENT_PROCESSING_DOCX_MAX_COMPRESSION_RATIO)
  ) {
    throw new DocumentProcessingError("file_validation_failed");
  }
}

async function extractTxt(bytes: Uint8Array): Promise<ExtractedDocument> {
  if (looksLikeBinaryText(bytes)) throw new DocumentProcessingError("file_validation_failed");
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DocumentProcessingError("file_validation_failed");
  }
  const sections = splitIntoLogicalSections(decoded);
  if (!sections.length) throw new DocumentProcessingError("text_extraction_failed");
  return { outcome: "completed", sections };
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractedDocument> {
  assertSafeDocxArchive(bytes);
  try {
    const mammoth = await import("mammoth");
    // Mammoth's raw-text API accepts no options and defaults external file
    // access to false. Supplying only an in-memory buffer prevents a path
    // from being available to the parser.
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const sections = splitIntoLogicalSections(result.value);
    return sections.length ? { outcome: "completed", sections } : { outcome: "unsupported", sections: [] };
  } catch (error) {
    if (isDocumentProcessingError(error)) throw error;
    throw new DocumentProcessingError("text_extraction_failed");
  }
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractedDocument> {
  try {
    assertPdfHeader(bytes);
    const { extractText } = await import("unpdf");
    const extracted = await extractText(bytes, { mergePages: false });
    const sections = extracted.text
      .map((page, index) => ({ pageNumber: index + 1, content: normalizeExtractedText(page) }))
      .filter((page) => Boolean(page.content));
    ensureExtractedTextWithinLimit(sections);
    return sections.length ? { outcome: "completed", sections } : { outcome: "needs_ocr", sections: [] };
  } catch (error) {
    if (isDocumentProcessingError(error)) throw error;
    throw new DocumentProcessingError("text_extraction_failed");
  }
}

/** Selects a parser only from server-verified MIME metadata and filename. */
export async function extractDocumentText({
  bytes,
  filename,
  mimeType,
}: {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}): Promise<ExtractedDocument> {
  assertTrustedFileInput({ bytes, filename, mimeType });
  if (mimeType === TEXT_MIME_TYPE) return extractTxt(bytes);
  if (mimeType === DOCX_MIME_TYPE) return extractDocx(bytes);
  if (mimeType === PDF_MIME_TYPE) return extractPdf(bytes);
  throw new DocumentProcessingError("file_validation_failed");
}
