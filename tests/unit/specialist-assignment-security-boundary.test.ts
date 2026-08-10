import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actionSource = readFileSync("lib/specialists/actions.ts", "utf8");
const serverSource = readFileSync("lib/specialists/server.ts", "utf8");
const migrationSource = readFileSync("supabase/migrations/20260805000000_specialist_assignment.sql", "utf8");
const clientComponents = [
  "components/specialists/specialist-assignment-controls.tsx",
  "components/specialists/specialist-response-form.tsx",
];
const specialistRoutes = [
  "app/[locale]/specialist/layout.tsx",
  "app/[locale]/specialist/support-requests/page.tsx",
  "app/[locale]/specialist/support-requests/[requestId]/page.tsx",
];

describe("specialist assignment security boundaries", () => {
  it("keeps the Server Action module limited to async exports without elevated access", () => {
    expect(actionSource.startsWith('"use server"')).toBe(true);
    const exports = [...actionSource.matchAll(/^export\s+([^\n]+)/gm)].map((match) => match[1]);
    expect(exports).toHaveLength(3);
    expect(exports.every((statement) => statement.startsWith("async function"))).toBe(true);
    expect(actionSource).not.toMatch(/supabase\/admin|createAdminSupabaseClient|SUPABASE_SECRET_KEY/u);
    expect(actionSource).not.toMatch(/console\.(log|error|warn|info|debug)/u);
  });

  it("derives assignment authority in fixed-search-path database functions", () => {
    for (const functionName of [
      "assign_specialist_to_support_request",
      "revoke_specialist_from_support_request",
      "add_specialist_support_message",
      "list_assignable_specialists",
      "get_support_request_assignment",
      "list_support_request_assignment_events",
      "list_specialist_support_requests",
      "get_specialist_support_request",
    ]) {
      expect(migrationSource).toContain(`function public.${functionName}`);
    }
    expect(migrationSource).toContain("set search_path = ''");
    expect(migrationSource).toContain("auth.uid()");
    expect(migrationSource).toContain("for update");
    expect(migrationSource).toContain("expected_assignment_version");
    expect(migrationSource).toContain("private.is_current_user_administrator()");
  });

  it("never authorizes ETH-026 through household-wide helpers", () => {
    // The whole point of ETH-026 is a request-level grant. household_specialists
    // and can_access_household() appear only in explanatory comments.
    const executable = migrationSource
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(executable).not.toContain("household_specialists");
    expect(executable).not.toContain("can_access_household");
    expect(executable).not.toContain("is_assigned_specialist(");
    expect(executable).toContain("private.is_assigned_open_request_specialist");
  });

  it("scopes every specialist policy to a live, open, assigned request", () => {
    const policies = migrationSource.match(/create policy[\s\S]*?;/g) ?? [];
    const specialistPolicies = policies.filter((policy) => policy.includes("assigned_specialist_read"));
    expect(specialistPolicies).toHaveLength(2);
    for (const policy of specialistPolicies) {
      expect(policy).toContain("private.is_assigned_open_request_specialist");
    }
    // Authorization is re-derived from live rows, never cached in a session or claim.
    expect(migrationSource).toContain("thread.status = 'open'");
    expect(migrationSource).not.toMatch(/jwt.*specialist|claim.*specialist/iu);
  });

  it("keeps assignment audit history restricted to platform administrators", () => {
    expect(migrationSource).toContain("support_request_assignment_events_administrator_read");
    const auditPolicy = (migrationSource.match(/create policy[\s\S]*?;/g) ?? []).find((policy) =>
      policy.includes("support_request_assignment_events_administrator_read"),
    );
    expect(auditPolicy).toContain("private.is_current_user_administrator()");
    expect(auditPolicy).not.toContain("is_active_household_member");
  });

  it("keeps client components away from elevated clients and server environment values", () => {
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

  it("keeps specialist reads server-only and free of household-private entities", () => {
    expect(serverSource).toContain('import "server-only"');
    expect(serverSource).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/u);
    for (const file of specialistRoutes) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/dependents|documents|roadmap|reminders|household_members/u);
      expect(source).not.toMatch(/console\.(log|error|warn|info|debug)/u);
    }
  });

  it("never logs request or message content", () => {
    for (const file of ["lib/specialists/actions.ts", "lib/specialists/server.ts", ...clientComponents]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/console\.(log|error|warn|info|debug)/u);
    }
  });

  it("keeps ETH-026 assignment sources free of ETH-027 scheduling behavior", () => {
    // ETH-027 owns appointments; the assignment layer must not schedule. The
    // shared revoke helper may end a live appointment, which is ETH-027 calling
    // in rather than ETH-026 scheduling.
    for (const source of [actionSource, serverSource]) {
      expect(source).not.toMatch(/appointment|booking|availability_slot|timezone_match/iu);
    }
  });

  it("keeps notification behavior out of ETH-026", () => {
    for (const source of [actionSource, serverSource, migrationSource]) {
      expect(source).not.toMatch(/notification|notify|sendEmail|resend/iu);
    }
  });
});
