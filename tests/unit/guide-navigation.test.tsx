import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { GuideModuleNav, GuideSequenceNav } from "@/components/training/guide-navigation";
import { buildGuideSequence } from "@/lib/training/guide-sequence";
import type { TrainingOutlineRow } from "@/lib/training/server";

const row = (lesson: string, module: string): TrainingOutlineRow =>
  ({
    lesson_id: lesson,
    lesson_title: `Lesson ${lesson}`,
    lesson_localized: {},
    module_id: module,
    module_title: `Module ${module}`,
    module_localized: {},
  }) as unknown as TrainingOutlineRow;

const outline = [row("1a", "A"), row("1b", "A"), row("2a", "B"), row("3a", "C")];
const plain = (_localized: unknown, fallback: string) => fallback;
const labels = {
  previousLesson: "Previous lesson",
  nextLesson: "Next lesson",
  previousModule: "Previous module",
  nextModule: "Next module",
};

describe("guide navigation", () => {
  it("lists each module once, linking to its first lesson guide", () => {
    const sequence = buildGuideSequence(outline, "1b", plain);
    expect(sequence.modules.map((module) => module.href)).toEqual([
      "/training/lessons/1a/guide",
      "/training/lessons/2a/guide",
      "/training/lessons/3a/guide",
    ]);
    expect(sequence.currentModuleId).toBe("A");
  });

  it("steps across module boundaries", () => {
    const sequence = buildGuideSequence(outline, "1b", plain);
    expect(sequence.previous?.lessonId).toBe("1a");
    expect(sequence.next?.lessonId).toBe("2a");
    expect(buildGuideSequence(outline, "1a", plain).previous).toBeNull();
    expect(buildGuideSequence(outline, "3a", plain).next).toBeNull();
    expect(buildGuideSequence(outline, "missing", plain).next).toBeNull();
  });

  it("labels a step into another module as Next module", () => {
    render(
      <GuideSequenceNav label="Guides" labels={labels} sequence={buildGuideSequence(outline, "1b", plain)} />,
    );
    const next = screen.getByRole("link", { name: /Next module/ });
    expect(next).toHaveAttribute("href", "/training/lessons/2a/guide");
    expect(next).toHaveTextContent("Module B");
    expect(screen.getByRole("link", { name: /Previous lesson/ })).toHaveAttribute(
      "href",
      "/training/lessons/1a/guide",
    );
  });

  it("marks the current module", () => {
    render(
      <GuideModuleNav
        label="Modules"
        moduleLabel={(number) => `Module ${number}`}
        sequence={buildGuideSequence(outline, "2a", plain)}
      />,
    );
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent("Module 2: Module B");
  });
});
