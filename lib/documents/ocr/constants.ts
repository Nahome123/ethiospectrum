import { DOCUMENT_PROCESSING_MAX_FILE_BYTES } from "@/lib/documents/processing/constants";

export const DOCUMENT_OCR_MAX_FILE_BYTES = DOCUMENT_PROCESSING_MAX_FILE_BYTES;
export const DOCUMENT_OCR_MAX_PAGES = 50;
export const DOCUMENT_OCR_MAX_RENDER_DIMENSION = 2_048;
export const DOCUMENT_OCR_MAX_PAGE_PIXELS = 3_000_000;
export const DOCUMENT_OCR_MAX_TOTAL_PIXELS = 24_000_000;
export const DOCUMENT_OCR_MAX_RENDERED_IMAGE_BYTES = 8 * 1024 * 1024;
export const DOCUMENT_OCR_RENDER_TIMEOUT_MS = 20_000;
export const DOCUMENT_OCR_DOCUMENT_TIMEOUT_MS = 90_000;
export const DOCUMENT_OCR_PROVIDER_TIMEOUT_MS = 30_000;
export const DOCUMENT_OCR_BATCH_LIMIT = 2;

export const DOCUMENT_OCR_FAILURE_CODES = [
  "storage_download_failed",
  "file_validation_failed",
  "ocr_unavailable",
  "ocr_render_failed",
  "ocr_timeout",
  "ocr_provider_failed",
  "ocr_output_empty",
  "ocr_output_too_large",
  "worker_timeout",
] as const;

export type DocumentOcrFailureCode = (typeof DOCUMENT_OCR_FAILURE_CODES)[number];
