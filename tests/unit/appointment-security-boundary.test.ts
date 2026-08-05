import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actionSource = readFileSync("lib/appointments/actions.ts", "utf8");
const serverSource = readFileSync("lib/appointments/server.ts", "utf8");
const migrationSource = readFileSync("supabase/migrations/20260806000000_appointment_scheduling.sql", "utf8");
const clientComponents = [
  "components/appointments/appointment-proposal-form.tsx",
  "components/appointments/appointment-consent-form.tsx",
  "components/appointments/appointment-lifecycle-controls.tsx",
];

function executableSql(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("appointment security boundaries", () => {
  it("keeps the Server Action module limited to async exports without elevated access", () => {
    expect(actionSource.startsWith('"use server"')).toBe(true);
    const exports = [...actionSource.matchAll(/^export\s+([^\n]+)/gm)].map((match) => match[1]);
    expect(exports).toHaveLength(5);
    expect(exports.every((statement) => statement.startsWith("async function"))).toBe(true);
    expect(actionSource).not.toMatch(/supabase\/admin|createAdminSupabaseClient|SUPABASE_SECRET_KEY/u);
  });

  it("replaces the unsafe household-wide appointments policy", () => {
    expect(migrationSource).toContain("drop policy if exists appointments_access on public.appointments");
    expect(migrationSource).toContain("alter table public.appointments force row level security");
    const policies = migrationSource.match(/create policy[\s\S]*?;/g) ?? [];
    const appointmentPolicies = policies.filter((policy) => policy.includes("appointment"));
    expect(appointmentPolicies.length).toBeGreaterThanOrEqual(2);
    for (const policy of appointmentPolicies) {
      expect(policy).not.toContain("can_access_household");
      expect(policy).not.toContain("household_specialists");
      expect(policy).not.toMatch(/is_assigned_specialist\(/u);
    }
  });

  it("never authorizes appointments through household-wide helpers", () => {
    const executable = executableSql(migrationSource);
    expect(executable).not.toContain("can_access_household");
    expect(executable).not.toContain("household_specialists");
    // Specialist access derives from the request's current assignment only.
    expect(executable).toContain("private.is_assigned_open_request_specialist");
    expect(executable).toContain("thread.specialist_id");
  });

  it("derives appointment authority in fixed-search-path database functions", () => {
    for (const functionName of [
      "propose_support_appointment",
      "accept_support_appointment",
      "decline_support_appointment",
      "cancel_support_appointment",
      "complete_support_appointment",
      "get_support_appointment",
      "list_appointment_events",
    ]) {
      expect(migrationSource).toContain(`function public.${functionName}`);
    }
    expect(migrationSource).toContain("set search_path = ''");
    expect(migrationSource).toContain("auth.uid()");
    expect(migrationSource).toContain("for update");
    expect(migrationSource).toContain("expected_version");
    expect(migrationSource).toContain("pg_advisory_xact_lock");
  });

  it("rejects ambiguous and nonexistent local times rather than guessing", () => {
    expect(migrationSource).toContain("pg_timezone_names");
    expect(migrationSource).toContain("does not exist in the selected timezone");
    expect(migrationSource).toContain("is ambiguous in the selected timezone");
  });

  it("keeps the meeting link out of logs, audit metadata, and unsafe rendering", () => {
    for (const file of [
      "lib/appointments/actions.ts",
      "lib/appointments/server.ts",
      "components/appointments/appointment-panel.tsx",
      ...clientComponents,
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/console\.(log|error|warn|info|debug)/u);
      expect(source).not.toContain("dangerouslySetInnerHTML");
    }
    // Audit metadata carries only category-style values, never the URL.
    const eventInserts = migrationSource.match(/jsonb_build_object\([^)]*\)/g) ?? [];
    for (const payload of eventInserts) {
      expect(payload).not.toMatch(/meeting_url|url/u);
    }
  });

  it("only releases the meeting link to the two parties after consent", () => {
    expect(migrationSource).toContain("appointment.status = 'scheduled'");
    expect(migrationSource).toMatch(/current_permission is not null or is_specialist/u);
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

  it("keeps appointment reads server-only and free of direct writes", () => {
    expect(serverSource).toContain('import "server-only"');
    expect(serverSource).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/u);
  });

  it("never trusts a browser consent actor, timestamp, or copy version", () => {
    expect(actionSource).toContain("APPOINTMENT_CONSENT_COPY_VERSION");
    expect(actionSource).toContain("input_acknowledged: true");
    expect(actionSource).not.toMatch(/consentedBy|consentedAt|input_consented/u);
  });

  it("excludes recurrence, external calendars, notifications, and ETH-028 billing", () => {
    const sources = [actionSource, serverSource, executableSql(migrationSource)];
    for (const source of sources) {
      expect(source).not.toMatch(/recurring|rrule|google.?calendar|ics|webcal/iu);
      expect(source).not.toMatch(/notification|notify|sendEmail|resend/iu);
      expect(source).not.toMatch(/stripe|subscription|invoice|checkout/iu);
    }
  });

  it("supports only video and phone modalities", () => {
    expect(migrationSource).toContain("'video'");
    expect(migrationSource).toContain("'phone'");
    expect(executableSql(migrationSource)).not.toContain("in_person");
    expect(actionSource).not.toContain("in_person");
  });
});
