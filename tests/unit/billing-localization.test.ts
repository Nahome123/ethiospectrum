import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const messages = ["en", "am", "es"].map(
  (locale) =>
    JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as {
      billing: Record<string, unknown>;
      navigation: Record<string, string>;
    },
);

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("billing localization", () => {
  it("keeps English, Amharic, and Spanish billing keys aligned", () => {
    const expected = keys(messages[0].billing).sort();
    for (const message of messages) {
      expect(keys(message.billing).sort()).toEqual(expected);
      expect(message.navigation.billing).toBeTruthy();
    }
  });

  it("contains the required billing concepts in every locale", () => {
    for (const message of messages) {
      const source = JSON.stringify(message.billing);
      for (const key of ["familyPlus", "monthly", "annual", "subscribe", "manageBilling", "history"]) {
        expect(source).toContain(key);
      }
    }
  });
});
