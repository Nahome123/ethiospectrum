import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("household authorization application boundary", () => {
  it("loads member display names from profiles and falls back only to the Auth email", () => {
    const memberShell = readFileSync(resolve("components/layout/member-shell.tsx"), "utf8");
    expect(memberShell).toContain("getCurrentMemberProfile");
    expect(memberShell).toContain("profile?.first_name || user?.email");
    expect(memberShell).not.toContain("user?.user_metadata.first_name");
  });

  it("uses the RLS-protected user_roles table for administrator decisions", () => {
    const server = readFileSync(resolve("lib/supabase/server.ts"), "utf8");
    const guard = readFileSync(resolve("lib/auth/guards.ts"), "utf8");
    expect(server).toContain('.from("user_roles")');
    expect(guard).toContain("getCurrentUserRole");
    expect(guard).not.toContain("app_metadata");
    expect(guard).not.toContain("user_metadata");
  });

  it("uses the Database contract across every Supabase client boundary", () => {
    for (const file of [
      "lib/supabase/browser.ts",
      "lib/supabase/server.ts",
      "lib/supabase/admin.ts",
      "lib/supabase/route-handler.ts",
      "lib/supabase/server-action.ts",
      "lib/supabase/middleware.ts",
    ]) {
      expect(readFileSync(resolve(file), "utf8")).toContain("<Database>");
    }
  });
});
