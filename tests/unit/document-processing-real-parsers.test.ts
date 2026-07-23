import { describe, expect, it } from "vitest";
import { extractDocumentText } from "@/lib/documents/processing/parsers";

const encoder = new TextEncoder();

type ZipEntry = {
  name: string;
  content: string;
};

function concatenateBytes(parts: readonly Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }

  return result;
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

/** Creates a tiny uncompressed ZIP sufficient for a synthetic DOCX fixture. */
function createStoredZip(entries: readonly ZipEntry[]): Uint8Array {
  const localFiles: Uint8Array[] = [];
  const centralDirectoryEntries: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const filename = encoder.encode(entry.name);
    const content = encoder.encode(entry.content);
    const checksum = crc32(content);
    const localFile = new Uint8Array(30 + filename.byteLength + content.byteLength);
    const localView = new DataView(localFile.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, content.byteLength, true);
    localView.setUint32(22, content.byteLength, true);
    localView.setUint16(26, filename.byteLength, true);
    localFile.set(filename, 30);
    localFile.set(content, 30 + filename.byteLength);
    localFiles.push(localFile);

    const centralDirectoryEntry = new Uint8Array(46 + filename.byteLength);
    const centralView = new DataView(centralDirectoryEntry.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, content.byteLength, true);
    centralView.setUint32(24, content.byteLength, true);
    centralView.setUint16(28, filename.byteLength, true);
    centralView.setUint32(42, localOffset, true);
    centralDirectoryEntry.set(filename, 46);
    centralDirectoryEntries.push(centralDirectoryEntry);
    localOffset += localFile.byteLength;
  }

  const centralDirectory = concatenateBytes(centralDirectoryEntries);
  const endOfCentralDirectory = new Uint8Array(22);
  const endView = new DataView(endOfCentralDirectory.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.byteLength, true);
  endView.setUint32(16, localOffset, true);

  return concatenateBytes([...localFiles, centralDirectory, endOfCentralDirectory]);
}

function createSyntheticDocx(): Uint8Array {
  return createStoredZip([
    {
      name: "[Content_Types].xml",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      name: "_rels/.rels",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      name: "word/document.xml",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic household document for parser verification only.</w:t></w:r></w:p></w:body></w:document>',
    },
  ]);
}

function createSyntheticPdf(): Uint8Array {
  const stream = "BT /F1 18 Tf 72 720 Td (Synthetic PDF document for parser verification only.) Tj ET";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${encoder.encode(stream).byteLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let document = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (const object of objects) {
    offsets.push(encoder.encode(document).byteLength);
    document += object;
  }

  const xrefOffset = encoder.encode(document).byteLength;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    document += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(document);
}

describe("document processing real parsers", () => {
  it("extracts text from a synthetic valid DOCX using Mammoth", async () => {
    await expect(
      extractDocumentText({
        bytes: createSyntheticDocx(),
        filename: "synthetic-document.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).resolves.toEqual({
      outcome: "completed",
      sections: [{ pageNumber: 1, content: "Synthetic household document for parser verification only." }],
    });
  });

  it("extracts text from a synthetic valid PDF using unpdf", async () => {
    await expect(
      extractDocumentText({
        bytes: createSyntheticPdf(),
        filename: "synthetic-document.pdf",
        mimeType: "application/pdf",
      }),
    ).resolves.toEqual({
      outcome: "completed",
      sections: [{ pageNumber: 1, content: "Synthetic PDF document for parser verification only." }],
    });
  });
});
