import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("document question security boundaries", () => {
  it("keeps the use-server question action module limited to an async action export", () => {
    const actionModule = read("lib/documents/question-actions.ts");
    const exports = [...actionModule.matchAll(/^export\s+(.+)$/gmu)].map((match) => match[1] ?? "");
    expect(actionModule).toContain('"use server"');
    expect(exports).toEqual([expect.stringMatching(/^async function requestDocumentQuestionAction\(/u)]);
    expect(actionModule).not.toMatch(/^export\s+(?:const|let|type|interface|\{)/mu);
  });

  it("keeps provider clients, secrets, and admins out of document components", () => {
    const components = readdirSync(path.join(root, "components", "documents")).filter((name) =>
      name.endsWith(".tsx"),
    );
    for (const file of components) {
      const contents = read(`components/documents/${file}`);
      expect(contents).not.toMatch(/from\s+["']openai["']/u);
      expect(contents).not.toContain("/questions/openai-provider");
      expect(contents).not.toContain("/questions/internal-secret");
      expect(contents).not.toContain("@/lib/env/server");
      expect(contents).not.toContain("@/lib/supabase/admin");
    }
  });

  it("uses only server-only Q&A runtime modules and never public secrets or runtime logging", () => {
    const env = read("lib/env/server.ts");
    const runtimeModules = [
      "lib/documents/openai-structured-provider.ts",
      "lib/documents/questions/openai-provider.ts",
      "lib/documents/questions/prompt.ts",
      "lib/documents/questions/runner.ts",
      "app/api/internal/document-questions/route.ts",
    ].map(read);
    expect(env).not.toContain("NEXT_PUBLIC_OPENAI");
    expect(env).not.toContain("NEXT_PUBLIC_DOCUMENT_QUESTION");
    for (const runtimeModule of runtimeModules) {
      expect(runtimeModule).not.toMatch(/console\.(?:log|debug|info|warn|error)\s*\(/u);
    }
  });
});
