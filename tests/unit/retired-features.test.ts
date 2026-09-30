import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { isFeatureEnabled, retiredFeatures } from "@/config/features";

vi.mock("@/lib/documents/processing/internal-secret", () => ({
  hasValidDocumentProcessingSecret: () => true,
}));
vi.mock("@/lib/documents/processing/runner", () => ({ runDocumentProcessingBatch: vi.fn() }));

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("PRD section 42 demo reconciliation", () => {
  it("disables every retired demo feature", () => {
    for (const feature of Object.keys(retiredFeatures) as (keyof typeof retiredFeatures)[]) {
      expect(isFeatureEnabled(feature)).toBe(false);
    }
  });

  it("answers 404 from retired worker routes before doing any work", async () => {
    const { POST } = await import("@/app/api/internal/document-processing/route");
    const response = await POST(
      new Request("http://localhost/api/internal/document-processing", { method: "POST" }),
    );
    expect(response.status).toBe(404);
  });

  it("gates each retired route segment with the central flag", () => {
    const gates: Record<string, string> = {
      "app/[locale]/(member)/assistant/layout.tsx": "assistant",
      "app/[locale]/(member)/roadmap/layout.tsx": "roadmap",
      "app/[locale]/(member)/reminders/layout.tsx": "reminders",
      "app/[locale]/(member)/support/layout.tsx": "supportRequests",
      "app/[locale]/(member)/member/resources/layout.tsx": "resourceHub",
      "app/[locale]/(member)/documents/[documentId]/chat/layout.tsx": "documentAi",
      "app/[locale]/editor/layout.tsx": "resourceHub",
      "app/[locale]/admin/resources/layout.tsx": "resourceHub",
      "app/[locale]/admin/translations/layout.tsx": "resourceHub",
      "app/[locale]/admin/support-requests/layout.tsx": "supportRequests",
      "app/[locale]/admin/prompts/layout.tsx": "adminPlaceholders",
      "app/[locale]/admin/documents/layout.tsx": "adminPlaceholders",
      "app/[locale]/admin/audit-logs/layout.tsx": "adminPlaceholders",
      "app/[locale]/specialist/support-requests/layout.tsx": "supportRequests",
      "app/[locale]/(marketing)/training/rbt-preview/layout.tsx": "publicTrainingPreview",
      "app/api/workers/reminders/route.ts": "reminders",
    };
    for (const [file, feature] of Object.entries(gates)) {
      const source = read(file);
      expect(source, file).toMatch(new RegExp(`(requireFeature|retiredApiResponse)\\("${feature}"\\)`));
    }
  });

  it("does not link retired pages from the launch navigation", () => {
    const member = read("components/layout/member-shell.tsx");
    for (const retired of ["/roadmap", "/reminders", "/assistant", '/support"', "/member/resources"]) {
      expect(member).not.toContain(retired);
    }
  });

  it("protects the RBT study guide behind the subscription", () => {
    expect(read("app/[locale]/(member)/training/rbt/layout.tsx")).toContain("requireTrainingAccess");
  });
});
