import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("document chat security boundaries", () => {
  it("keeps use-server chat actions limited to asynchronous exports", () => {
    const actionModule = read("lib/documents/chat-actions.ts");
    const exports = [...actionModule.matchAll(/^export\s+(.+)$/gmu)].map((match) => match[1] ?? "");
    expect(actionModule).toContain('"use server"');
    expect(exports).toEqual([
      expect.stringMatching(/^async function createDocumentChatConversationAction\(/u),
      expect.stringMatching(/^async function sendDocumentChatMessageAction\(/u),
      expect.stringMatching(/^async function retryDocumentChatResponseAction\(/u),
    ]);
  });

  it("keeps provider clients, service-role access, sources, and excerpts out of chat client components", () => {
    const files = readdirSync(path.join(root, "components", "documents")).filter((name) =>
      name.startsWith("document-chat"),
    );
    for (const file of files) {
      const contents = read(`components/documents/${file}`);
      expect(contents).not.toMatch(/from\s+["']openai["']/u);
      expect(contents).not.toContain("@/lib/supabase/admin");
      expect(contents).not.toContain("@/lib/env/server");
      expect(contents).not.toContain("excerpt");
    }
  });

  it("keeps the chat provider boundary server-only and free of runtime logging", () => {
    const runtimeModules = [
      "lib/documents/chat/openai-provider.ts",
      "lib/documents/chat/prompt.ts",
      "lib/documents/chat/runner.ts",
      "app/api/internal/document-chats/route.ts",
    ].map(read);
    for (const runtimeModule of runtimeModules) {
      expect(runtimeModule).not.toMatch(/console\.(?:log|debug|info|warn|error)\s*\(/u);
    }
  });
});
