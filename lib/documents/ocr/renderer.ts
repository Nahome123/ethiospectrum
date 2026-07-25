import "server-only";

import type { getDocumentProxy } from "unpdf";
import {
  DOCUMENT_OCR_DOCUMENT_TIMEOUT_MS,
  DOCUMENT_OCR_MAX_FILE_BYTES,
  DOCUMENT_OCR_MAX_PAGE_PIXELS,
  DOCUMENT_OCR_MAX_PAGES,
  DOCUMENT_OCR_MAX_RENDER_DIMENSION,
  DOCUMENT_OCR_MAX_RENDERED_IMAGE_BYTES,
  DOCUMENT_OCR_MAX_TOTAL_PIXELS,
  DOCUMENT_OCR_RENDER_TIMEOUT_MS,
} from "./constants";
import { DocumentOcrError } from "./errors";
import type { RenderedOcrPage } from "./types";

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

function hasPdfHeader(bytes: Uint8Array): boolean {
  const header = [0x25, 0x50, 0x44, 0x46, 0x2d];
  const searchLimit = Math.min(1_024, bytes.byteLength - header.length + 1);
  for (let offset = 0; offset < searchLimit; offset += 1) {
    if (header.every((byte, index) => bytes[offset + index] === byte)) return true;
  }
  return false;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new DocumentOcrError("ocr_timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function calculateRenderSize(viewport: { width: number; height: number }): { width: number; height: number } {
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    throw new DocumentOcrError("ocr_render_failed");
  }
  const dimensionScale = Math.min(
    1,
    DOCUMENT_OCR_MAX_RENDER_DIMENSION / Math.max(viewport.width, viewport.height),
  );
  const pixelScale = Math.min(
    1,
    Math.sqrt(DOCUMENT_OCR_MAX_PAGE_PIXELS / (viewport.width * viewport.height)),
  );
  const scale = Math.min(dimensionScale, pixelScale);
  const width = Math.max(1, Math.floor(viewport.width * scale));
  const height = Math.max(1, Math.floor(viewport.height * scale));
  if (
    width > DOCUMENT_OCR_MAX_RENDER_DIMENSION ||
    height > DOCUMENT_OCR_MAX_RENDER_DIMENSION ||
    width * height > DOCUMENT_OCR_MAX_PAGE_PIXELS
  ) {
    throw new DocumentOcrError("ocr_render_failed");
  }
  return { width, height };
}

function remainingDocumentTime(deadline: number, perOperationLimit: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new DocumentOcrError("ocr_timeout");
  return Math.min(remaining, perOperationLimit);
}

/**
 * Renders one page at a time in memory. PDF.js receives in-memory bytes only,
 * with no URL, worker fetch, embedded JavaScript evaluation, or public storage
 * output. Each page is discarded by the caller immediately after OCR.
 */
export async function* renderOcrPdfPages(bytes: Uint8Array): AsyncGenerator<RenderedOcrPage> {
  if (bytes.byteLength === 0 || bytes.byteLength > DOCUMENT_OCR_MAX_FILE_BYTES || !hasPdfHeader(bytes)) {
    throw new DocumentOcrError("file_validation_failed");
  }

  const deadline = Date.now() + DOCUMENT_OCR_DOCUMENT_TIMEOUT_MS;
  let document: PdfDocument | undefined;
  try {
    const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
    document = await withTimeout(
      getDocumentProxy(bytes, {
        disableFontFace: true,
        disableStream: true,
        disableAutoFetch: true,
        enableXfa: false,
        isEvalSupported: false,
        useWorkerFetch: false,
        stopAtErrors: true,
      }),
      remainingDocumentTime(deadline, DOCUMENT_OCR_DOCUMENT_TIMEOUT_MS),
      () => {
        void document?.destroy();
      },
    );

    if (
      !Number.isInteger(document.numPages) ||
      document.numPages < 1 ||
      document.numPages > DOCUMENT_OCR_MAX_PAGES
    ) {
      throw new DocumentOcrError("ocr_render_failed");
    }

    let totalPixels = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await withTimeout(
        document.getPage(pageNumber),
        remainingDocumentTime(deadline, DOCUMENT_OCR_RENDER_TIMEOUT_MS),
        () => {
          void document?.destroy();
        },
      );
      try {
        const { width, height } = calculateRenderSize(page.getViewport({ scale: 1 }));
        totalPixels += width * height;
        if (totalPixels > DOCUMENT_OCR_MAX_TOTAL_PIXELS) throw new DocumentOcrError("ocr_render_failed");
        const image = new Uint8Array(
          await withTimeout(
            renderPageAsImage(document, pageNumber, {
              canvasImport: () => import("@napi-rs/canvas"),
              width,
              height,
            }),
            remainingDocumentTime(deadline, DOCUMENT_OCR_RENDER_TIMEOUT_MS),
            () => {
              void document?.destroy();
            },
          ),
        );
        if (image.byteLength === 0 || image.byteLength > DOCUMENT_OCR_MAX_RENDERED_IMAGE_BYTES) {
          throw new DocumentOcrError("ocr_render_failed");
        }
        yield { pageNumber, imageBytes: image, width, height };
      } finally {
        page.cleanup();
      }
    }
  } catch (error) {
    if (error instanceof DocumentOcrError) throw error;
    throw new DocumentOcrError("ocr_render_failed");
  } finally {
    await document?.cleanup();
    await document?.destroy();
  }
}
