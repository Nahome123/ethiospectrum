import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("protected route architecture", () => {
  it("keeps the foundation session server-only and deny-by-default", () => {
    const guard = readFileSync(resolve("lib/auth/guards.ts"), "utf8");
    expect(guard).toContain('import "server-only"');
    expect(guard).toContain("return null");
    expect(guard).toContain("requireRole");
  });
});
