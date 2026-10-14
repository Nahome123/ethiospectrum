import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { LessonBody, LessonResource } from "@/components/training/lesson-study-guide";

describe("lesson study guide layout", () => {
  it("turns bullets into a list and the closing line into a highlight", () => {
    render(
      <LessonBody
        body={
          "Autism is a neurodevelopmental condition.\n\n• Social communication\n• Sensory differences\n\nEvery child is unique."
        }
        title="Lesson notes"
      />,
    );
    expect(screen.getByRole("heading", { name: "Lesson notes" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Every child is unique.").className).toContain("bg-[#e8f5ee]");
  });

  it("bolds short labels such as Myth and Truth", () => {
    render(
      <LessonBody
        body={'Myth: "It is a curse."\nTruth: Autism is a neurological difference.'}
        title="Notes"
      />,
    );
    expect(screen.getByText("Myth:").tagName).toBe("STRONG");
    expect(screen.getByText("Truth:").tagName).toBe("STRONG");
  });

  it("shows a PDF in the page with a download link", () => {
    render(
      <LessonResource
        downloadHref="https://files.example.test/guide.pdf?download"
        downloadLabel="Download"
        isPdf
        label="Study guide"
        viewHref="https://files.example.test/guide.pdf"
        viewerTitle="Errorless teaching"
      />,
    );
    expect(screen.getByTitle("Errorless teaching")).toHaveAttribute(
      "src",
      "https://files.example.test/guide.pdf",
    );
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "https://files.example.test/guide.pdf?download",
    );
  });

  it("offers other files as a download only", () => {
    render(
      <LessonResource
        downloadHref="https://files.example.test/slides.pptx"
        downloadLabel="Open the slides"
        isPdf={false}
        label="Slides"
        viewHref="https://files.example.test/slides.pptx"
        viewerTitle="Slides"
      />,
    );
    expect(screen.queryByTitle("Slides")).toBeNull();
    expect(screen.getByRole("link", { name: "Open the slides" })).toBeInTheDocument();
  });
});
