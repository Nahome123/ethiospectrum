import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = path.join(process.cwd(), ".github/workflows/document-processing.yml");

describe("document-processing scheduler workflow", () => {
  it("validates an exact HTTPS origin before sending the invocation secret", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const validationIndex = workflow.indexOf("- name: Validate scheduler configuration");
    const invocationIndex = workflow.indexOf("- name: Run one bounded processing batch");

    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(invocationIndex).toBeGreaterThan(validationIndex);
    expect(workflow).toContain("permissions: {}");
    expect(workflow).not.toContain("actions/checkout");
    expect(workflow).toContain("const url = new URL(value);");
    expect(workflow).toContain('url.protocol !== "https:"');
    expect(workflow).toContain("url.username");
    expect(workflow).toContain("url.password");
    expect(workflow).toContain('url.pathname !== "/"');
    expect(workflow).toContain("url.search");
    expect(workflow).toContain("url.hash");
    expect(workflow).toContain("value !== url.origin");
    expect(workflow).toContain('"${DOCUMENT_PROCESSING_ORIGIN}/api/internal/document-processing"');
    expect(workflow).toContain('"x-document-processing-secret: $DOCUMENT_PROCESSING_SECRET"');
    expect(workflow).not.toMatch(
      /(?:echo|console\.(?:log|error))[^\n]*(?:DOCUMENT_PROCESSING_ORIGIN|DOCUMENT_PROCESSING_SECRET)/u,
    );
  });
});
