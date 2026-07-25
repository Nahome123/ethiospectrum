import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rbtTrainingContent } from "@/features/training/rbt/content";
import {
  getRbtElementsByClass,
  getRbtNodeText,
  getRbtProgressPercentage,
  normalizeRbtCompletedSections,
} from "@/features/training/rbt/helpers";
import { rbtRouteBySection } from "@/features/training/rbt/constants";
import { rbtSectionIds } from "@/features/training/rbt/types";

const sourceText = [
  getRbtNodeText(rbtTrainingContent.hero),
  ...rbtTrainingContent.navigation.map(({ label }) => label),
  ...rbtTrainingContent.sections.map(({ node }) => getRbtNodeText(node)),
  getRbtNodeText(rbtTrainingContent.footer),
].join("\n");

function normalizeVisibleText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

describe("RBT training source integrity", () => {
  it("preserves all seven supplied sections in their source order", () => {
    expect(rbtTrainingContent.sections.map(({ id }) => id)).toEqual(rbtSectionIds);
    expect(Object.values(rbtRouteBySection)).toEqual([
      "overview",
      "procedure",
      "error-correction",
      "setup",
      "flashcards",
      "glossary",
      "takeaways",
    ]);
  });

  it("keeps distinctive English and Amharic source strings", () => {
    expect(sourceText).toContain("Errorless Teaching & Intensive Teaching");
    expect(sourceText).toContain("Nebraska ASD Network");
    expect(sourceText).toMatch(/[\u1200-\u137f]/u);
    expect(sourceText).toContain("80:20 Ratio");
    expect(sourceText).toContain("PROMPT");
    expect(sourceText).toContain("END");
    expect(sourceText).toContain("Ready hands");
    expect(sourceText).toContain("Questions We Answered");
  });

  it("keeps Q4 through Q15, including the mixed-character DTT question", () => {
    const flashcards = rbtTrainingContent.sections.find(({ id }) => id === "flashcards");
    expect(flashcards).toBeDefined();
    const cards = getRbtElementsByClass(flashcards!.node, "qa-card");
    expect(cards).toHaveLength(12);
    for (let question = 4; question <= 15; question += 1) {
      expect(getRbtNodeText(cards[question - 4])).toContain(`Q${question}:`);
    }
    expect(getRbtNodeText(cards[9])).toContain("DTT");
    expect(getRbtNodeText(cards[9])).toMatch(/[\u0e00-\u0e7f]/u);
  });

  it("keeps every supplied glossary term and footer attribution", () => {
    for (const term of [
      "ABC",
      "Behavior",
      "Discrete Trial (DTT)",
      "Extinction",
      "Extinction Burst",
      "Generalization",
      "Mand",
      "Tact",
      "Reinforcement",
      "Shaping",
      "Task Analysis",
      "Chaining",
      "Intraverbal",
      "Prompt",
    ]) {
      expect(sourceText).toContain(term);
    }
    expect(sourceText).toContain("Hopebridge");
    expect(sourceText).toContain("Nebraska ASD Network");
  });

  it("preserves the complete visible body text from the archived source artifact", () => {
    const archive = readFileSync(
      resolve("docs/source-artifacts/rbt-errorless-teaching-original.html"),
      "utf8",
    );
    const body = archive.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
    expect(body).toBeDefined();
    const archivedVisibleText = body!
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    expect(normalizeVisibleText(sourceText)).toBe(normalizeVisibleText(archivedVisibleText));
  });

  it("does not execute or inject the archived artifact at runtime", () => {
    const contentModule = readFileSync(resolve("features/training/rbt/content.ts"), "utf8");
    const lesson = readFileSync(resolve("components/training/rbt-training-lesson.tsx"), "utf8");
    expect(contentModule).not.toContain("dangerouslySetInnerHTML");
    expect(contentModule).not.toContain("showTab(");
    expect(lesson).not.toContain("iframe");
    expect(lesson).not.toContain("fetch(");
  });

  it("normalizes progress and never uses certification terminology for completion", () => {
    expect(normalizeRbtCompletedSections(["overview", "overview", "bad", "setup"])).toEqual([
      "overview",
      "setup",
    ]);
    expect(getRbtProgressPercentage(["overview", "setup"])).toBe(29);
    const progressComponent = readFileSync(resolve("components/training/training-progress.tsx"), "utf8");
    expect(progressComponent).not.toMatch(/certified|BACB approved|competency passed/i);
  });
});
