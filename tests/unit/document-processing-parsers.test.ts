import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractRawText: vi.fn(),
  extractText: vi.fn(),
}));

vi.mock("mammoth", () => ({ extractRawText: mocks.extractRawText }));
vi.mock("unpdf", () => ({ extractText: mocks.extractText }));

import { extractDocumentText } from "@/lib/documents/processing/parsers";

const encoder = new TextEncoder();

describe("document processing parsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts UTF-8 TXT text while preserving multilingual content", async () => {
    const bytes = encoder.encode("\u1230\u120b\u121d \u12d3\u1208\u12ed\nResumen familiar");

    await expect(
      extractDocumentText({
        bytes,
        filename: "family-summary.TXT",
        mimeType: "text/plain",
      }),
    ).resolves.toEqual({
      outcome: "completed",
      sections: [{ pageNumber: 1, content: "\u1230\u120b\u121d \u12d3\u1208\u12ed\nResumen familiar" }],
    });
  });

  it("rejects mismatched metadata and binary TXT before extraction", async () => {
    await expect(
      extractDocumentText({
        bytes: encoder.encode("ordinary text"),
        filename: "ordinary.pdf",
        mimeType: "text/plain",
      }),
    ).rejects.toMatchObject({ code: "file_validation_failed" });

    await expect(
      extractDocumentText({
        bytes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
        filename: "ordinary.txt",
        mimeType: "text/plain",
      }),
    ).rejects.toMatchObject({ code: "file_validation_failed" });
  });

  it("uses page-level PDF extraction without exposing parser failures", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4");
    mocks.extractText.mockResolvedValue({
      text: [
        "This is a sufficiently long first page of extracted text.",
        "\u12e8\u1201\u1208\u1270 \u1308\u133d",
      ],
    });

    await expect(
      extractDocumentText({
        bytes,
        filename: "school-report.pdf",
        mimeType: "application/pdf",
      }),
    ).resolves.toEqual({
      outcome: "completed",
      sections: [
        { pageNumber: 1, content: "This is a sufficiently long first page of extracted text." },
        { pageNumber: 2, content: "\u12e8\u1201\u1208\u1270 \u1308\u133d" },
      ],
    });
    expect(mocks.extractText).toHaveBeenCalledWith(bytes, { mergePages: false });

    mocks.extractText.mockRejectedValue(new Error("raw parser implementation detail"));
    await expect(
      extractDocumentText({
        bytes,
        filename: "school-report.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toMatchObject({ code: "text_extraction_failed" });
  });

  it("marks textless PDF pages as needing OCR without attempting OCR", async () => {
    mocks.extractText.mockResolvedValue({ text: ["", "  "] });

    await expect(
      extractDocumentText({
        bytes: new TextEncoder().encode("%PDF-1.4"),
        filename: "scanned.pdf",
        mimeType: "application/pdf",
      }),
    ).resolves.toEqual({ outcome: "needs_ocr", sections: [] });
    expect(mocks.extractText).toHaveBeenCalledTimes(1);
  });

  it("rejects a declared PDF without a bounded PDF header before parser execution", async () => {
    await expect(
      extractDocumentText({
        bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]),
        filename: "not-a-pdf.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toMatchObject({ code: "file_validation_failed" });

    expect(mocks.extractText).not.toHaveBeenCalled();
  });

  it("rejects malformed DOCX archives before Mammoth receives them", async () => {
    await expect(
      extractDocumentText({
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        filename: "medical-summary.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).rejects.toMatchObject({ code: "file_validation_failed" });
    expect(mocks.extractRawText).not.toHaveBeenCalled();
  });
});
