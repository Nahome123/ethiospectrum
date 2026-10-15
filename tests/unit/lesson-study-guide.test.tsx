import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { BilingualGuide, LessonResource, StudyGuideCard } from "@/components/training/lesson-study-guide";

const english =
  "Autism is a neurodevelopmental condition.\n\n• Social communication\n• Sensory differences\n\nEvery child is unique.";
const amharic = "አውቲዝም የአንጎል እድገት ሂደት ነው።\n\n• ማህበራዊ ግንኙነት\n• የስሜት ልዩነቶች\n\nእያንዳንዱ ልጅ የተለየ ነው።";

describe("lesson study guide layout", () => {
  it("pairs English and Amharic lines side by side", () => {
    const { container } = render(
      <BilingualGuide
        amharic={amharic}
        amharicMissing="Coming soon"
        english={english}
        title="What is autism?"
        titleAmharic="አውቲዝም ምንድን ነው?"
      />,
    );
    expect(screen.getByRole("heading", { name: "What is autism?" })).toBeInTheDocument();
    expect(screen.getByText("Social communication").closest(".grid")).toHaveTextContent("ማህበራዊ ግንኙነት");
    expect(container.querySelectorAll('[lang="am"]').length).toBeGreaterThan(3);
    const closing = screen.getByText("Every child is unique.").closest("div.rounded-2xl");
    expect(closing).toHaveTextContent("እያንዳንዱ ልጅ የተለየ ነው።");
    expect(screen.queryByText("Coming soon")).toBeNull();
  });

  it("notes a missing Amharic translation and bolds Myth / Truth labels", () => {
    render(
      <BilingualGuide
        amharic={null}
        amharicMissing="Coming soon"
        english={'Myth: "It is a curse."\nTruth: Autism is a neurological difference.'}
        title="Myths"
        titleAmharic="Myths"
      />,
    );
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByText("Myth:").tagName).toBe("STRONG");
    expect(screen.getByText("Truth:").tagName).toBe("STRONG");
  });

  it("links the study guide card to the guide", () => {
    render(
      <StudyGuideCard
        buttonLabel="Open the bilingual study guide"
        description="Read this lesson in English and Amharic side by side."
        href="/training/lessons/abc/guide"
        title="Bilingual study guide"
      />,
    );
    expect(screen.getByRole("link", { name: /Open the bilingual study guide/ })).toHaveAttribute(
      "href",
      "/training/lessons/abc/guide",
    );
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
});
