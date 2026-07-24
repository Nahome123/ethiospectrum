import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function documentComponentFiles(): string[] {
  const directory = path.join(root, "components", "documents");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => path.join(directory, name));
}

describe("document summary security boundaries", () => {
  it("keeps the use-server summary action module limited to async function exports", () => {
    const actionModule = read("lib/documents/summary-actions.ts");
    const exports = [...actionModule.matchAll(/^export\s+(.+)$/gmu)].map((match) => match[1] ?? "");

    expect(actionModule).toContain('"use server"');
    expect(exports).toEqual([expect.stringMatching(/^async function requestDocumentSummaryAction\(/u)]);
    expect(actionModule).not.toMatch(/^export\s+(?:const|let|type|interface|\{)/mu);
  });

  it("keeps provider SDKs, server secrets, and admin clients outside browser document components", () => {
    for (const file of documentComponentFiles()) {
      const contents = readFileSync(file, "utf8");
      expect(contents).not.toMatch(/from\s+["']openai["']/u);
      expect(contents).not.toContain("/summaries/openai-provider");
      expect(contents).not.toContain("/summaries/internal-secret");
      expect(contents).not.toContain("@/lib/env/server");
      expect(contents).not.toContain("@/lib/supabase/admin");
    }
  });

  it("uses a server-only environment boundary and avoids public summary credentials or runtime logging", () => {
    const env = read("lib/env/server.ts");
    const runtimeModules = [
      "lib/documents/summaries/openai-provider.ts",
      "lib/documents/summaries/prompt.ts",
      "lib/documents/summaries/runner.ts",
      "app/api/internal/document-summaries/route.ts",
    ].map(read);

    expect(env).not.toContain("NEXT_PUBLIC_OPENAI");
    expect(env).not.toContain("NEXT_PUBLIC_DOCUMENT_SUMMARY");
    for (const runtimeModule of runtimeModules) {
      expect(runtimeModule).not.toMatch(/console\.(?:log|debug|info|warn|error)\s*\(/u);
    }
  });
});
