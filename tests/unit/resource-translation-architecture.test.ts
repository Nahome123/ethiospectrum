import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(file), "utf8");
const actions = read("lib/resources/translation-actions.ts");
const schema = read("lib/validation/resource-translations.ts");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : [".ts", ".tsx", ".sql"].includes(extname(path))
        ? [path]
        : [];
  });
}

describe("resource translation architecture", () => {
  it("keeps the Server Action module limited to async exports", () => {
    expect(actions.startsWith('"use server"')).toBe(true);
    const exports = [...actions.matchAll(/^export\s+([^\n]+)/gm)].map((match) => match[1]);
    expect(exports).toHaveLength(6);
    expect(exports.every((statement) => statement.startsWith("async function"))).toBe(true);
    expect(actions).not.toContain("export const");
    expect(actions).not.toContain("export function");
  });

  it("keeps authorization global and does not import household access", () => {
    expect(actions).toContain("getAuthenticatedUser");
    expect(actions).toContain('user?.role === "administrator"');
    expect(actions).toContain('user?.role === "content_editor"');
    expect(actions).not.toMatch(/household|membership|permission/i);
    expect(actions).not.toContain("createAdminSupabaseClient");
  });

  it("keeps client translation components away from elevated clients and server environment values", () => {
    for (const file of [
      "components/resources/translation-form.tsx",
      "components/resources/translation-transition-controls.tsx",
    ]) {
      const client = read(file);
      expect(client).toContain('"use client"');
      expect(client).not.toContain("createAdminSupabaseClient");
      expect(client).not.toContain("createServerActionSupabaseClient");
      expect(client).not.toContain("SUPABASE_SECRET_KEY");
      expect(client).not.toContain("process.env");
    }
  });

  it("defines only Amharic and Spanish mutation workflows", () => {
    expect(schema).toContain('z.enum(["am", "es"])');
    expect(schema).not.toMatch(/machine.?translation|google.?translate|deepl/i);
    expect(actions).not.toMatch(/machine.?translation|google.?translate|deepl|openai/i);
  });

  it("contains no ETH-025 implementation in application or database source", () => {
    const files = ["app", "components", "lib", "supabase/migrations"].flatMap(sourceFiles);
    const matches = files.filter(
      (file) => /eth[-_ ]?025/i.test(file) || /eth-025/i.test(readFileSync(file, "utf8")),
    );
    expect(matches).toEqual([]);
  });
});
