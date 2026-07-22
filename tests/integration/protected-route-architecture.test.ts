import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("protected route architecture", () => {
  it("keeps route authorization server-only and claims-based", () => {
    const guard = readFileSync(resolve("lib/auth/guards.ts"), "utf8");
    expect(guard).toContain('import "server-only"');
    expect(guard).toContain("getCurrentSupabaseClaims");
    expect(guard).not.toContain("getSession");
    expect(guard).not.toContain("Foundation-mode");
    expect(guard).toContain("requireRole");
  });
});
