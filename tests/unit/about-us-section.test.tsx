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
    expect(screen.getByText("Yamrot Bekele")).toBeInTheDocument();
    expect(screen.getByText("Child Development Consultant")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.queryByText(/founder/i, { selector: "p.uppercase" })).toBeNull();
    expect(screen.getByText("Milka Abebe")).toBeInTheDocument();
    expect(screen.getByText("BCBA Candidate · Provider")).toBeInTheDocument();
    expect(screen.getByText("Yoftahe Mulatu Gebru")).toBeInTheDocument();
    expect(screen.getByText("Consultant · Parent Support")).toBeInTheDocument();
    expect(screen.getByText(/Road 2 Healing \(TR2H\) Tour/)).toBeInTheDocument();
    expect(screen.queryByText("Bio coming soon.")).toBeNull();
    expect(screen.getByRole("img", { name: /Milka Abebe/ })).toBeInTheDocument();
  });
});
