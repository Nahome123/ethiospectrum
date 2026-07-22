import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientEntrypoints = [
  "lib/env/client.ts",
  "lib/supabase/browser.ts",
  "components/auth/auth-form.tsx",
  "components/auth/password-recovery-form.tsx",
];

describe("client secret boundary", () => {
  it("does not reference the Supabase secret key from browser-safe modules", () => {
    for (const file of clientEntrypoints) {
      expect(readFileSync(resolve(file), "utf8")).not.toContain("SUPABASE_SECRET_KEY");
    }
  });

  it("keeps the elevated client explicitly server-only", () => {
    const adminClient = readFileSync(resolve("lib/supabase/admin.ts"), "utf8");
    expect(adminClient).toContain('import "server-only"');
    expect(adminClient).toContain("requireSupabaseAdminEnv");
  });
});
