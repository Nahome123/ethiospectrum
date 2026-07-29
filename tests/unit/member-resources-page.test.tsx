import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

type TestLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
};

const translations: Record<string, string> = {
  "navigation.training": "RBT Errorless Teaching Training Guide",
  "resources.eyebrow": "Learning library",
  "resources.pageIntro": "Browse educational material designed to help families prepare.",
  "resources.rbtTrainingAction": "Open training guide",
  "resources.rbtTrainingDescription": "Learn errorless teaching concepts.",
  "resources.title": "Information that meets families where they are.",
};

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: TestLinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => translations[key] ?? key),
}));

import { MemberPage } from "@/components/member/member-page";

describe("member resources page", () => {
  it("offers the RBT training guide from Resources instead of treating it as a placeholder", async () => {
    render(await MemberPage({ page: "resources" }));

    expect(screen.getByRole("heading", { name: "RBT Errorless Teaching Training Guide" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open training guide" })).toHaveAttribute(
      "href",
      "/training/rbt",
    );
    expect(screen.queryByText("common.developmentOnly")).not.toBeInTheDocument();
  });
});
