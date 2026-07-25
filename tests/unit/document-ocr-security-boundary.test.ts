import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("OCR security boundary", () => {
  it("confines provider code and worker credentials to server-only modules", () => {
    expect(read("lib/documents/ocr/provider.ts")).toContain('import "server-only"');
    expect(read("lib/documents/ocr/renderer.ts")).toContain('import "server-only"');
    expect(read("lib/documents/ocr/runner.ts")).toContain('import "server-only"');
    expect(read("components/documents/ocr-document-button.tsx")).not.toContain("openai");
    expect(read("components/documents/ocr-document-button.tsx")).not.toContain("OCR_API_KEY");
  });

  it("does not generate public URLs or log private OCR inputs and outputs", () => {
    const ocrSource = [
      read("lib/documents/ocr/provider.ts"),
      read("lib/documents/ocr/renderer.ts"),
      read("lib/documents/ocr/runner.ts"),
    ].join("\n");
    expect(ocrSource).not.toContain("getPublicUrl");
    expect(ocrSource).not.toContain("console.log");
    expect(ocrSource).not.toContain("createSignedUrl");
  });
});
