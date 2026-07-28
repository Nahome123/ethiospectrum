import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import am from "@/messages/am.json";
import en from "@/messages/en.json";

const source = (file: string) => readFileSync(resolve(file), "utf8");

describe("education support landing experience", () => {
  it("uses localized copy and real application destinations", () => {
    const section = source("components/marketing/education-support-section.tsx");
    const guide = source("components/marketing/education-guide-page.tsx");

    expect(section.trimStart().startsWith('"use client"')).toBe(false);
    expect(section).toContain('href="/resources/education"');
    expect(section).toContain('href="/assistant"');
    expect(section).toContain('href="/pricing"');
    expect(guide).toContain('href="/signup"');
    expect(section).not.toContain("household.name");
    expect(section).not.toContain("analytics");

    for (const messages of [en, am]) {
      expect(messages.educationSupport.title).toEqual(expect.any(String));
      expect(messages.educationSupport.primaryAction).toEqual(expect.any(String));
      expect(messages.educationSupport.assistant.action).toEqual(expect.any(String));
      expect(messages.educationGuide.disclaimer).toEqual(expect.any(String));
    }
  });

  it("keeps action links keyboard-reachable and cards educational", () => {
    const featureCard = source("components/marketing/feature-card.tsx");
    const section = source("components/marketing/education-support-section.tsx");

    expect(featureCard).toContain("min-h-11");
    expect(featureCard).toContain("focus-visible:outline-2");
    expect(section).toContain("educationFeatureItems");
    expect(section).toContain("educationArticleItems");
  });
});
