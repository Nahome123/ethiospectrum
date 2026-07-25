import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

type TestLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
};

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: TestLinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/training",
}));

import { MemberNavigation } from "@/components/layout/member-navigation";

describe("member navigation", () => {
  const props = {
    closeLabel: "Close navigation menu",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/training", label: "RBT Errorless Teaching Training Guide" },
    ],
    label: "Family workspace",
    menuLabel: "Menu",
    openLabel: "Open navigation menu",
  };

  it("opens the compact navigation and marks the current destination", async () => {
    const user = userEvent.setup();
    render(<MemberNavigation {...props} />);

    const menu = screen.getByRole("button", { name: "Open navigation menu" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "RBT Errorless Teaching Training Guide" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "Family workspace" })).not.toHaveClass("hidden");

    await user.click(screen.getByRole("link", { name: "RBT Errorless Teaching Training Guide" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });
});
