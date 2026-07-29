import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actionSource = readFileSync("lib/roadmap/actions.ts", "utf8");
const migrationSource = readFileSync(
  "supabase/migrations/20260730000000_household_roadmap_management.sql",
  "utf8",
);

describe("roadmap authorization boundaries", () => {
  it("keeps mutations in server actions and avoids service-role or reminder access", () => {
    expect(actionSource).toContain('"use server"');
    expect(actionSource).not.toMatch(/supabase\/admin|createAdminClient|SUPABASE_SECRET_KEY/u);
    expect(actionSource).not.toContain("reminders");
    expect(actionSource).toContain("revalidatePath");
  });

  it("derives authorization in fixed-search-path database functions", () => {
    for (const functionName of [
      "create_roadmap_item",
      "update_roadmap_item",
      "archive_roadmap_item",
      "restore_roadmap_item",
      "reorder_roadmap_items",
    ]) {
      expect(migrationSource).toContain(`function public.${functionName}`);
    }
    expect(migrationSource).toContain("auth.uid()");
    expect(migrationSource).toContain("set search_path = ''");
    expect(migrationSource).toContain("for update");
    expect(migrationSource).toContain("expected_updated_at");
  });
});
