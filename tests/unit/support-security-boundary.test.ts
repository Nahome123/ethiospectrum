import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actionSource = readFileSync("lib/support/actions.ts", "utf8");
const serverSource = readFileSync("lib/support/server.ts", "utf8");
const migrationSource = readFileSync(
  "supabase/migrations/20260804000000_specialist_support_requests.sql",
  "utf8",
);
const clientComponents = [
  "components/support/support-request-form.tsx",
  "components/support/support-message-form.tsx",
  "components/support/support-request-actions.tsx",
];

describe("support request security boundaries", () => {
  it("keeps the Server Action module limited to async exports without elevated access", () => {
    expect(actionSource.startsWith('"use server"')).toBe(true);
    const exports = [...actionSource.matchAll(/^export\s+([^\n]+)/gm)].map((match) => match[1]);
    expect(exports).toHaveLength(4);
    expect(exports.every((statement) => statement.startsWith("async function"))).toBe(true);
    expect(actionSource).not.toMatch(/supabase\/admin|createAdminSupabaseClient|SUPABASE_SECRET_KEY/u);
    expect(actionSource).not.toMatch(/console\.(log|error|warn)/u);
    expect(actionSource).toContain("revalidatePath");
  });

  it("derives authorization in fixed-search-path database functions", () => {
    for (const functionName of [
      "create_support_request",
      "add_support_request_message",
      "close_support_request",
      "cancel_support_request",
      "list_support_requests",
      "get_support_request_messages",
      "list_support_requests_admin",
    ]) {
      expect(migrationSource).toContain(`function public.${functionName}`);
    }
    expect(migrationSource).toContain("auth.uid()");
    expect(migrationSource).toContain("set search_path = ''");
    expect(migrationSource).toContain("for update");
    expect(migrationSource).toContain("expected_version");
    expect(migrationSource).toContain("pg_advisory_xact_lock");
  });

  it("replaces the specialist-inclusive policies with member-or-administrator reads", () => {
    expect(migrationSource).toContain("drop policy if exists support_threads_access");
    expect(migrationSource).toContain("drop policy if exists support_messages_access");
    const policies = migrationSource.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThanOrEqual(3);
    for (const policy of policies) {
      expect(policy).toContain("private.is_active_household_member");
      expect(policy).toContain("private.is_current_user_administrator");
      expect(policy).not.toContain("is_assigned_specialist");
      expect(policy).not.toContain("can_access_household");
    }
  });

  it("keeps browser components away from elevated clients and server environment values", () => {
    for (const file of clientComponents) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain('"use client"');
      expect(source).not.toContain("createAdminSupabaseClient");
      expect(source).not.toContain("createServerActionSupabaseClient");
      expect(source).not.toContain("createServerComponentSupabaseClient");
      expect(source).not.toContain("SUPABASE_SECRET_KEY");
      expect(source).not.toContain("process.env");
    }
  });

  it("keeps support reads in a server-only module without raw table writes", () => {
    expect(serverSource).toContain('import "server-only"');
    expect(serverSource).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/u);
    expect(serverSource).not.toMatch(/supabase\/admin|SUPABASE_SECRET_KEY/u);
  });

  it("never logs request or message content", () => {
    for (const file of ["lib/support/actions.ts", "lib/support/server.ts", ...clientComponents]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/console\.(log|error|warn|info|debug)/u);
    }
  });

  it("keeps the browser payload free of acknowledgment authority", () => {
    expect(actionSource).toContain("input_acknowledged: true");
    expect(actionSource).not.toMatch(/expectations_copy_version|expectations_acknowledged_at/u);
  });
});
