import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_OCR_MAX_PAGE_PIXELS,
  DOCUMENT_OCR_MAX_RENDER_DIMENSION,
  DOCUMENT_OCR_MAX_PAGES,
} from "@/lib/documents/ocr/constants";

const mocks = vi.hoisted(() => ({
  getDocumentProxy: vi.fn(),
  renderPageAsImage: vi.fn(),
}));

vi.mock("unpdf", () => ({
  getDocumentProxy: mocks.getDocumentProxy,
  renderPageAsImage: mocks.renderPageAsImage,
}));

import { renderOcrPdfPages } from "@/lib/documents/ocr/renderer";

function pdfDocument({ pages = 1, width = 612, height = 792 } = {}) {
  return {
    numPages: pages,
    getPage: vi.fn().mockResolvedValue({
      cleanup: vi.fn(),
      getViewport: vi.fn().mockReturnValue({ width, height }),
    }),
    cleanup: vi.fn(),
    destroy: vi.fn(),
  };
}

describe("OCR PDF renderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.renderPageAsImage.mockResolvedValue(new Uint8Array([137, 80, 78, 71]).buffer);
  });

  it("rejects malformed non-PDF input before invoking the PDF library", async () => {
    await expect(Array.fromAsync(renderOcrPdfPages(new Uint8Array([0, 1, 2])))).rejects.toMatchObject({
      code: "file_validation_failed",
    });
    expect(mocks.getDocumentProxy).not.toHaveBeenCalled();
  });

  it("rejects PDFs over the configured page count", async () => {
    mocks.getDocumentProxy.mockResolvedValue(pdfDocument({ pages: DOCUMENT_OCR_MAX_PAGES + 1 }));
    await expect(
      Array.fromAsync(renderOcrPdfPages(new TextEncoder().encode("%PDF-1.4"))),
    ).rejects.toMatchObject({
      code: "ocr_render_failed",
    });
  });

  it("downscales oversized pages to bounded dimensions and pixels before server-only rendering", async () => {
    mocks.getDocumentProxy.mockResolvedValue(pdfDocument({ width: 20_000, height: 10_000 }));
    await expect(Array.fromAsync(renderOcrPdfPages(new TextEncoder().encode("%PDF-1.4")))).resolves.toEqual([
      expect.objectContaining({ pageNumber: 1, imageBytes: new Uint8Array([137, 80, 78, 71]) }),
    ]);

    const [, , options] = mocks.renderPageAsImage.mock.calls[0] as [
      unknown,
      number,
      { width: number; height: number },
    ];
    expect(options.width).toBeLessThanOrEqual(DOCUMENT_OCR_MAX_RENDER_DIMENSION);
    expect(options.height).toBeLessThanOrEqual(DOCUMENT_OCR_MAX_RENDER_DIMENSION);
    expect(options.width * options.height).toBeLessThanOrEqual(DOCUMENT_OCR_MAX_PAGE_PIXELS);
  });
});
