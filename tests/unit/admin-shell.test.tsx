import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

type TestLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
};

const mocks = vi.hoisted(() => ({
  getCurrentMemberProfile: vi.fn(),
  getCurrentSupabaseUser: vi.fn(),
  signOutAction: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: TestLinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "es"),
  getTranslations: vi.fn(async () => (key: string) => (key === "member.logout" ? "Cerrar sesión" : key)),
}));

vi.mock("@/lib/auth/actions", () => ({ signOutAction: mocks.signOutAction }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentMemberProfile: mocks.getCurrentMemberProfile,
  getCurrentSupabaseUser: mocks.getCurrentSupabaseUser,
}));
vi.mock("@/components/layout/brand-logo", () => ({ BrandLogo: () => <div>Ethiospectrum</div> }));
vi.mock("@/components/layout/language-selector", () => ({
  LanguageSelector: () => <div>Language selector</div>,
}));

import { AdminShell } from "@/components/layout/admin-shell";

describe("AdminShell", () => {
  it("shows the verified administrator profile and signs out in the active locale", async () => {
    mocks.getCurrentSupabaseUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.getCurrentMemberProfile.mockResolvedValue({
      first_name: "Almaz",
      preferred_locale: "es",
      timezone: "America/New_York",
    });

    render(await AdminShell({ children: <div>Admin content</div> }));

    expect(screen.getByText("Almaz")).toHaveAttribute("title", "Almaz");
    const logoutButton = screen.getByRole("button", { name: "Cerrar sesión" });
    fireEvent.submit(logoutButton.closest("form")!);

    await waitFor(() => {
      expect(mocks.signOutAction).toHaveBeenCalledWith("es", expect.any(FormData));
    });
  });
});
