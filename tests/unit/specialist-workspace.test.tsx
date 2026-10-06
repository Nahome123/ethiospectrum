import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "en"),
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/auth/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentMemberProfile: vi.fn(async () => null),
  getCurrentSupabaseUser: vi.fn(async () => ({ id: "specialist-1", email: "s@example.test" })),
  getCurrentUserRole: vi.fn(async () => "specialist"),
}));
vi.mock("@/components/layout/brand-logo", () => ({ BrandLogo: () => <span>logo</span> }));
vi.mock("@/components/layout/language-selector", () => ({ LanguageSelector: () => null }));
vi.mock("@/components/layout/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/layout/member-shell", () => ({
  MemberShell: ({ children }: { children: ReactNode }) => children,
}));

import MemberLayout from "@/app/[locale]/(member)/layout";
import { SpecialistShell } from "@/components/layout/specialist-shell";

describe("specialist workspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("has exactly four navigation items, all inside the specialist workspace", async () => {
    render(await SpecialistShell({ children: <div /> }));
    const nav = screen.getByRole("navigation", { name: "specialistConsole.workspace" });
    const links = Array.from(nav.querySelectorAll("a")).map((link) => [
      link.textContent,
      link.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["specialistConsole.nav.dashboard", "/specialist"],
      ["specialistConsole.nav.closed", "/specialist?scope=closed"],
      ["specialistConsole.nav.settings", "/specialist/settings"],
      ["specialistConsole.nav.notifications", "/specialist/notifications"],
    ]);
  });

  it("links nowhere in the family workspace", async () => {
    render(await SpecialistShell({ children: <div /> }));
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^\/specialist/);
    }
  });

  it("sends a specialist who opens a family route back to the specialist workspace", async () => {
    mocks.requireUser.mockResolvedValue({ id: "specialist-1", role: "specialist" });
    await expect(
      MemberLayout({ children: <div />, params: Promise.resolve({ locale: "en" }) }),
    ).rejects.toThrow("redirect:/en/specialist");
  });

  it("still lets families and the administrator preview use the family workspace", async () => {
    for (const role of ["member", "administrator"]) {
      mocks.requireUser.mockResolvedValue({ id: "user-1", role });
      await expect(
        MemberLayout({ children: <div />, params: Promise.resolve({ locale: "en" }) }),
      ).resolves.toBeTruthy();
    }
  });
});
