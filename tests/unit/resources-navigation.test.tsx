import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((target: { href: string; locale: string }) => {
    throw new Error(`redirect:/${target.locale}${target.href}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/i18n/navigation", () => ({
  redirect: mocks.redirect,
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/resources/server", () => ({
  getPublishedResources: vi.fn(async () => []),
  getPublishedResource: vi.fn(async () => null),
}));

import ResourcesPage from "@/app/[locale]/(marketing)/resources/page";
import ResourceDetailPage from "@/app/[locale]/(marketing)/resources/[slug]/page";
import { EducationGuidePage } from "@/components/marketing/education-guide-page";

describe("Resources navigation", () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
  });

  it("sends the retired resource hub addresses to the education guide instead of a 404", async () => {
    await expect(
      ResourcesPage({ params: Promise.resolve({ locale: "am" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/am/resources/education");
    await expect(
      ResourceDetailPage({ params: Promise.resolve({ locale: "en", slug: "old-article" }) }),
    ).rejects.toThrow("redirect:/en/resources/education");
  });

  it("links the education guide's back link to the home page, not the retired hub", async () => {
    render(await EducationGuidePage());
    const back = screen.getByRole("link", { name: "common.backToHome" });
    expect(back).toHaveAttribute("href", "/");
    expect(document.querySelector('a[href="/resources"]')).toBeNull();
  });
});
