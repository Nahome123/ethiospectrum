import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalDocumentView } from "@/components/marketing/legal-document";
import { privacyPolicy, termsOfUse } from "@/lib/legal/documents";

const allText = (document: typeof termsOfUse) =>
  [
    document.summary,
    ...document.sections.flatMap((section) => [section.title, ...section.blocks.flat()]),
  ].join("\n");

describe("legal documents", () => {
  it.each([
    ["terms", termsOfUse],
    ["privacy", privacyPolicy],
  ])("%s names Ethiospectrum only, with unique section anchors", (_name, document) => {
    const text = allText(document);
    expect(text).not.toMatch(/special x|undivided|apple/i);
    expect(text).toContain("Ethiospectrum");
    const ids = document.sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("states the subscription and appointment refund rules the app applies", () => {
    const text = allText(termsOfUse);
    expect(text).toContain("renews automatically each month");
    expect(text).toContain("more than 48 hours before");
    expect(text).toContain("within 24 hours there is no cash refund");
  });

  it("renders a table of contents that links to each section", () => {
    render(
      <LegalDocumentView
        contentsLabel="On this page"
        document={privacyPolicy}
        draftNotice="Draft"
        englishOnlyNotice="English only"
        lastUpdatedLabel="Last updated"
        title="Privacy Policy"
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("English only")).toBeInTheDocument();
    const contents = screen.getByRole("navigation", { name: "On this page" });
    expect(contents.querySelectorAll("a")).toHaveLength(privacyPolicy.sections.length);
    expect(contents.querySelector("a")?.getAttribute("href")).toBe(`#${privacyPolicy.sections[0].id}`);
  });
});
