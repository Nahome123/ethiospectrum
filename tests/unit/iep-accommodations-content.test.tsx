import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IepAccommodationsGuide } from "@/components/resources/iep-accommodations-guide";
import { iepAccommodationsContent } from "@/features/resources/iep-accommodations/content";

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/gu, "")
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function archivedSections() {
  const archive = readFileSync("docs/source-artifacts/iep-504-accommodations-original.html", "utf8");
  return [
    ...archive.matchAll(
      /<section class="sec" id="([^"]+)"[\s\S]*?<h2>([\s\S]*?)<\/h2>[\s\S]*?<p class="sec-am" lang="am">([\s\S]*?)<\/p>([\s\S]*?)<\/section>/gu,
    ),
  ].map((section) => ({
    id: section[1],
    title: decodeHtml(section[2]),
    titleAm: decodeHtml(section[3]),
    items: [
      ...section[4].matchAll(/<td class="en"[^>]*>([\s\S]*?)<\/td>\s*<td class="am"[^>]*>([\s\S]*?)<\/td>/gu),
    ].map((row) => ({ en: decodeHtml(row[1]), am: decodeHtml(row[2]) })),
  }));
}

const labels = {
  amharic: "Amharic",
  backToTop: "Back to top",
  contents: "Contents",
  contentsDescription: "Jump to a category.",
  contentsStatus: "Contents",
  english: "English",
  eyebrow: "IEP and 504 · English / Amharic",
  readingProgress: "Reading progress",
  sectionStatus: (section: number, total: number) => `Section ${section} of ${total}`,
  sectionSummary: (section: number, count: number) => `Section ${section} · ${count} accommodations`,
};

describe("IEP and 504 accommodations guide", () => {
  it("preserves all 18 supplied categories and 187 bilingual examples", () => {
    expect(iepAccommodationsContent.sections).toHaveLength(18);
    expect(iepAccommodationsContent.sections.flatMap((section) => section.items)).toHaveLength(187);
    expect(
      iepAccommodationsContent.sections.every((section) => section.declaredCount === section.items.length),
    ).toBe(true);
    expect(JSON.stringify(iepAccommodationsContent)).toMatch(/[\u1200-\u137f]/u);
  });

  it("matches every category and example in the archived supplied HTML", () => {
    const archived = archivedSections();
    expect(
      iepAccommodationsContent.sections.map(({ id, title, titleAm, items }) => ({
        id,
        title,
        titleAm,
        items,
      })),
    ).toEqual(archived);
  });

  it("renders semantic bilingual tables without injecting or executing the archived HTML", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const { container } = render(<IepAccommodationsGuide labels={labels} />);

    expect(screen.getByRole("heading", { name: "Example Accommodations for IEPs and 504s" })).toBeVisible();
    expect(container.querySelectorAll("main section")).toHaveLength(18);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(187);
    expect(screen.getAllByRole("link", { name: /Classroom \/ Learning Environment/u })[0]).toHaveAttribute(
      "href",
      "#classroom-learning-environment",
    );
    screen.getByRole("button", { name: "Back to top" }).click();
    expect(scrollTo).toHaveBeenCalled();

    for (const runtimeFile of [
      "components/resources/iep-accommodations-guide.tsx",
      "components/resources/iep-accommodations-progress.tsx",
    ]) {
      const runtimeSource = readFileSync(runtimeFile, "utf8");
      expect(runtimeSource).not.toMatch(/dangerouslySetInnerHTML|<iframe|<script/iu);
    }
    scrollTo.mockRestore();
  });

  it("keeps the guide controls aligned across English, Amharic, and Spanish", () => {
    const messages = ["en", "am", "es"].map(
      (locale) =>
        JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as {
          iepAccommodations: Record<string, string>;
          resources: Record<string, string>;
        },
    );
    const guideKeys = Object.keys(messages[0].iepAccommodations).sort();
    for (const message of messages) {
      expect(Object.keys(message.iepAccommodations).sort()).toEqual(guideKeys);
      expect(message.resources.iepAccommodationsTitle).toBeTruthy();
      expect(message.resources.iepAccommodationsDescription).toBeTruthy();
      expect(message.resources.iepAccommodationsAction).toBeTruthy();
    }
  });
});
