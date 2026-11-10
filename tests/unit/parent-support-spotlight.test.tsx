import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { teamCalendlyUrl } from "@/lib/marketing/team-calendly";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => {
    return (messages.parentSupportSpotlight as Record<string, string>)[key];
  }),
}));

import { ParentSupportSpotlight } from "@/components/marketing/parent-support-spotlight";

describe("Parent Support spotlight", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends Talk to our team to the administrators' Calendly page", async () => {
    vi.stubEnv("TEAM_CALENDLY_URL", "https://calendly.com/ethiospectrum/intro");
    render(await ParentSupportSpotlight());
    const button = screen.getByRole("link", { name: /Talk to our team/ });
    expect(button).toHaveAttribute("href", "https://calendly.com/ethiospectrum/intro");
    expect(button).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Book with a provider" })).toHaveAttribute("href", "#about");
    expect(screen.queryByText(/Yoftahe/)).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("falls back to the request form without a team Calendly page", async () => {
    vi.stubEnv("TEAM_CALENDLY_URL", "");
    render(await ParentSupportSpotlight());
    expect(screen.getByRole("link", { name: "Talk to our team" })).toHaveAttribute(
      "href",
      "/services/parent-support",
    );
  });

  it("only accepts calendly.com links", () => {
    expect(teamCalendlyUrl(" https://calendly.com/team/30min ")).toBe("https://calendly.com/team/30min");
    expect(teamCalendlyUrl("https://evil.example/calendly.com")).toBeNull();
    expect(teamCalendlyUrl("javascript:alert(1)")).toBeNull();
    expect(teamCalendlyUrl(undefined)).toBeNull();
  });
});
