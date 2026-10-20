import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string>) => {
    const text = key
      .split(".")
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages.aboutUs);
    return String(text).replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? "");
  }),
}));

import { AboutUsSection } from "@/components/marketing/about-us-section";

describe("About us", () => {
  it("lists Yamrot as a provider and the two team members with their roles and bios", async () => {
    render(await AboutUsSection());
    expect(screen.getByRole("heading", { name: "Meet our team" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yamrot Bekele" })).toBeInTheDocument();
    expect(screen.getByText("Child Development Consultant · Provider")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Milka Abebe" })).toBeInTheDocument();
    expect(screen.getByText("BCBA Candidate · Provider")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yoftahe Mulatu Gebru" })).toBeInTheDocument();
    expect(screen.getByText("Consultant · Parent Support")).toBeInTheDocument();
    expect(screen.queryByText("Bio coming soon.")).toBeNull();
    expect(screen.getByRole("img", { name: /Milka Abebe/ })).toBeInTheDocument();
  });

  it("gives every card the same photo frame, one paragraph, and the rest under Read more", async () => {
    const { container } = render(await AboutUsSection());
    const cards = container.querySelectorAll("li");
    expect(cards).toHaveLength(3);
    cards.forEach((card) => {
      expect(card.querySelector('[role="img"]')).not.toBeNull();
      expect(card.querySelectorAll(":scope > div > p")).toHaveLength(1);
      expect(card.querySelector("details summary")).toHaveTextContent("Read more");
    });
    // The first paragraph is shown; later ones sit inside the collapsed section.
    expect(screen.getByText(/^Yoftahe Mulatu Gebru is the founder/).closest("details")).toBeNull();
    expect(screen.getByText(/Road 2 Healing \(TR2H\) Tour/).closest("details")).not.toHaveAttribute("open");
  });
});
