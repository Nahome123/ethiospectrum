import { describe, expect, it } from "vitest";
import { brandConfig } from "@/config/brand";

describe("brand configuration", () => {
  it("centralizes the Ethiospectrum identity", () => {
    expect(brandConfig.name).toBe("Ethiospectrum");
    expect(brandConfig.titleTemplate).toContain(brandConfig.name);
  });
});
