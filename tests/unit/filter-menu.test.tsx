import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

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

import { FilterMenu } from "@/components/ui/filter-menu";

const groups = [
  {
    label: "Payments",
    options: [
      { key: "failed", label: "Failed payments", href: "/x?queue=payment_failed", active: false },
      { key: "refunds", label: "Refund requests", href: "/x?queue=refunds", count: 2, active: true },
    ],
  },
];

describe("FilterMenu", () => {
  it("reveals grouped options only when opened", () => {
    render(<FilterMenu activeCount={1} groups={groups} label="More filters" />);
    expect(screen.queryByText("Failed payments")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /More filters/ }));
    expect(screen.getByText("Payments")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Refund requests/ })).toHaveAttribute("aria-current", "page");
  });

  it("closes on Escape and on an outside click", () => {
    render(<FilterMenu groups={groups} label="More filters" />);
    const button = screen.getByRole("button", { name: /More filters/ });
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Failed payments")).toBeNull();
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Failed payments")).toBeNull();
  });
});
