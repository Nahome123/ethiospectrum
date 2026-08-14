import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("continuous integration build environment", () => {
  it("uses non-production public Supabase placeholders for route validation", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const buildStep = workflow.slice(workflow.indexOf("- name: Build"));

    expect(buildStep).toContain("run: pnpm build");
    expect(buildStep).toContain("NEXT_PUBLIC_SUPABASE_URL: https://supabase.invalid");
    expect(buildStep).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ci-build-publishable-key");
    expect(buildStep).not.toMatch(/secrets\.|SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY/u);
  });
});
