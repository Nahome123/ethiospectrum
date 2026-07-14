import { describe, expect, it } from "vitest";
import { getSafeLocaleRedirect, isSafeInternalPath } from "@/lib/auth/redirects";

describe("authentication redirects", () => {
  const fallback = "/en/dashboard";

  it("accepts internal locale-relative paths", () => {
    expect(isSafeInternalPath("/en/dashboard?from=login")).toBe(true);
    expect(getSafeLocaleRedirect("/am/documents", fallback, "am")).toBe("/am/documents");
  });

  it("rejects external and protocol-relative paths", () => {
    expect(getSafeLocaleRedirect("https://example.com", fallback, "en")).toBe(fallback);
    expect(getSafeLocaleRedirect("//example.com", fallback, "en")).toBe(fallback);
  });

  it("rejects unsupported and mismatched locale paths", () => {
    expect(getSafeLocaleRedirect("/fr/dashboard", fallback)).toBe(fallback);
    expect(getSafeLocaleRedirect("/es/dashboard", fallback, "en")).toBe(fallback);
  });
});
