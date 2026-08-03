import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
};

const mocks = vi.hoisted(() => ({ getMemberResources: vi.fn() }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: TestLinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(
    async () => (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  ),
}));
vi.mock("@/lib/resources/server", () => ({ getMemberResources: mocks.getMemberResources }));
vi.mock("@/components/resources/member-resource-card", () => ({
  MemberResourceCardView: ({ resource }: { resource: { title: string } }) => <p>{resource.title}</p>,
}));

import { MemberResourceHub } from "@/components/resources/member-resource-hub";

const emptyPage = { items: [], page: 1, pageSize: 12, total: 0, totalPages: 1 };
const card = {
  slug: "school-guide",
  category: "education",
  resourceType: "guide",
  publishedAt: "2026-08-03T00:00:00Z",
  title: "School guide",
  summary: "Summary",
  selectedLocale: "en",
  usingEnglishFallback: false,
  isBookmarked: false,
  isAssigned: true,
  isFeatured: true,
};

describe("member resource hub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMemberResources.mockResolvedValue({ ...emptyPage, items: [card], total: 1 });
  });

  it("loads personalized, featured, saved, and latest sections with truthful catalog links", async () => {
    render(await MemberResourceHub({ locale: "en", searchParams: {} }));
    expect(mocks.getMemberResources.mock.calls).toEqual([
      ["en", { assignedOnly: true, pageSize: 6 }],
      ["en", { featuredOnly: true, pageSize: 6 }],
      ["en", { bookmarked: true, pageSize: 3 }],
      ["en", { pageSize: 6 }],
    ]);
    expect(screen.getAllByRole("link", { name: "viewAll" }).map((link) => link.getAttribute("href"))).toEqual(
      [
        "/member/resources?assigned=1",
        "/member/resources?featured=1",
        "/member/resources?bookmarked=1",
        "/member/resources?catalog=1",
      ],
    );
    expect(screen.getByRole("link", { name: "categories.education" })).toHaveAttribute(
      "href",
      "/member/resources?category=education",
    );
  });

  it("passes normalized assigned catalog filters to the database-backed loader", async () => {
    mocks.getMemberResources.mockResolvedValue(emptyPage);
    render(
      await MemberResourceHub({
        locale: "es",
        searchParams: { assigned: "1", q: "  school  ", page: "2" },
      }),
    );
    expect(mocks.getMemberResources).toHaveBeenCalledTimes(1);
    expect(mocks.getMemberResources).toHaveBeenCalledWith(
      "es",
      expect.objectContaining({ q: "school", assigned: true, assignedOnly: true, page: 2 }),
    );
    expect(screen.getByRole("heading", { name: "forYouTitle" })).toBeVisible();
    expect(screen.getByText("noMatches")).toBeVisible();
  });
});
