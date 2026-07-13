import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import am from "@/messages/am.json";
import es from "@/messages/es.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe("translation messages", () => {
  it("keeps English, Amharic, and Spanish keys structurally aligned", () => {
    expect(keys(am).sort()).toEqual(keys(en).sort());
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });

  it("does not contain the retired product name", () => {
    expect(JSON.stringify({ en, am, es })).not.toContain(["Family", "Bridge"].join(""));
  });
});
