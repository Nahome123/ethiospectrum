import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("resource security boundary", () => {
  it("uses server actions and a global editor guard without household data access", () => {
    const actions = read("lib/resources/actions.ts");
    expect(actions).toContain('"use server"');
    expect(actions).toContain("getAuthenticatedUser");
    expect(actions).not.toContain("createAdminSupabaseClient");
    expect(actions).not.toContain("household_id");
    expect(actions).toContain('user?.role === "administrator"');
  });
  it("keeps raw HTML out of the public Markdown renderer", () => {
    const markdown = read("components/resources/safe-markdown.tsx");
    expect(markdown).not.toContain("dangerouslySetInnerHTML");
    expect(markdown).toContain("noreferrer noopener");
  });
});
