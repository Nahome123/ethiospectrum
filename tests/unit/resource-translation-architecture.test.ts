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

  it("keeps ETH-024 translation modules free of ETH-025 support-request behavior", () => {
    for (const source of [actions, schema, read("lib/resources/translations-server.ts")]) {
      expect(source).not.toMatch(/support_thread|support_message|support_request/iu);
    }
  });

  it("keeps ETH-025 support-request modules from granting specialist access themselves", () => {
    const files = [
      "lib/support",
      "app/[locale]/(member)/support",
      "app/[locale]/admin/support-requests",
    ].flatMap(sourceFiles);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // ETH-026 owns every assignment mutation; ETH-025 surfaces may only read
      // the safe assigned-specialist name the database already resolved.
      expect(source).not.toMatch(/household_specialists|is_assigned_specialist/u);
      expect(source).not.toMatch(/\.rpc\("assign_specialist|\.rpc\("revoke_specialist/u);
      expect(source).not.toMatch(/\.from\("specialists"\)/u);
    }
    const eth025Migration = read("supabase/migrations/20260804000000_specialist_support_requests.sql");
    expect(eth025Migration).not.toMatch(/function\s+(public|private)\.[a-z_]*assign[a-z_]*\(/u);
    expect(eth025Migration).not.toContain("insert into public.household_specialists");
  });

  it("keeps ETH-026 assignment request-level and free of ETH-027 appointment behavior", () => {
    const eth026Migration = read("supabase/migrations/20260805000000_specialist_assignment.sql");
    // Request-level: the assignment lives on support_threads, never on a
    // household-wide record.
    expect(eth026Migration).toContain("public.support_threads");
    expect(eth026Migration).toContain("specialist_assigned_at");
    expect(eth026Migration).not.toContain("insert into public.household_specialists");
    expect(eth026Migration).not.toContain("update public.household_specialists");

    const files = ["lib/specialists", "components/specialists", "app/[locale]/specialist"].flatMap(
      sourceFiles,
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of [...files, "supabase/migrations/20260805000000_specialist_assignment.sql"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/appointment|booking|scheduling/iu);
      expect(source).not.toMatch(/notification|notify/iu);
    }
  });
});
