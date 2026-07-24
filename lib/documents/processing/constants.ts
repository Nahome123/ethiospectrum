import { DOCUMENT_MAX_BYTES } from "@/lib/documents/constants";

export const DOCUMENT_PROCESSING_MAX_FILE_BYTES = DOCUMENT_MAX_BYTES;
export const DOCUMENT_PROCESSING_MAX_EXTRACTED_CHARACTERS = 1_048_576;
export const DOCUMENT_PROCESSING_MAX_SECTIONS = 2_000;
export const DOCUMENT_PROCESSING_MAX_CHUNKS = 10_000;
export const DOCUMENT_PROCESSING_SECTION_MAX_CHARACTERS = 12_000;
export const DOCUMENT_PROCESSING_CHUNK_MAX_CHARACTERS = 1_200;
export const DOCUMENT_PROCESSING_CHUNK_OVERLAP_CHARACTERS = 150;
export const DOCUMENT_PROCESSING_DOCX_MAX_ENTRIES = 128;
export const DOCUMENT_PROCESSING_DOCX_MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
export const DOCUMENT_PROCESSING_DOCX_MAX_COMPRESSION_RATIO = 100;

export const DOCUMENT_PROCESSING_FAILURE_CODES = [
  "storage_download_failed",
  "file_validation_failed",
  "text_extraction_failed",
  "text_too_large",
  "worker_timeout",
] as const;

export type DocumentProcessingFailureCode = (typeof DOCUMENT_PROCESSING_FAILURE_CODES)[number];
