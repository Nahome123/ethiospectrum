import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RbtFlashcardList } from "@/components/training/rbt-flashcard-list";
import { RbtGlossaryList } from "@/components/training/rbt-glossary-list";
import { rbtTrainingContent } from "@/features/training/rbt/content";

describe("RBT training progressive interactions", () => {
  it("reveals a supplied flashcard answer with the keyboard", async () => {
    const user = userEvent.setup();
    const source = rbtTrainingContent.sections.find(({ id }) => id === "flashcards")!.node;
    render(
      <RbtFlashcardList
        labels={{
          collapseAll: "Collapse all",
          expandAll: "Expand all",
          hideAnswer: "Hide answer",
          revealAnswer: "Reveal answer",
        }}
        source={source}
      />,
    );

    const reveal = screen.getAllByRole("button", { name: "Reveal answer" })[0];
    reveal.focus();
    await user.keyboard("{Enter}");
    expect(reveal).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("What is indirect measurement?")).toBeVisible();
  });

  it("filters the glossary without mutating the source entries", async () => {
    const user = userEvent.setup();
    const source = rbtTrainingContent.sections.find(({ id }) => id === "glossary")!.node;
    render(
      <RbtGlossaryList labels={{ noMatches: "No matches", search: "Search glossary" }} source={source} />,
    );

    await user.type(screen.getByLabelText("Search glossary"), "intraverbal");
    expect(screen.getByText("Intraverbal")).toBeVisible();
    expect(screen.queryByText("Extinction Burst")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search glossary"));
    expect(screen.getByText("Extinction Burst")).toBeVisible();
  });
});
