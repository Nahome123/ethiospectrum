import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadPublic: vi.fn() }));

vi.mock("@/lib/services/booking-actions", () => ({
  loadPublicParentSupportSlotsAction: mocks.loadPublic,
  bookServiceSlotAction: vi.fn(),
  loadOpenSlotsAction: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

import { ParentSupportTimes } from "@/components/marketing/parent-support-times";
import { SlotBookingForm } from "@/components/services/slot-booking-form";

const yoftahe = "33333333-3333-4333-8333-333333333333";
const labels = { loading: "Loading", none: "No times", more: "See all", timesIn: "Times in {zone}" };

describe("Parent Support on the home page", () => {
  it("lists the next free times, each opening booking with that time selected", async () => {
    mocks.loadPublic.mockResolvedValue([
      { specialistId: yoftahe, startAt: "2026-11-02T15:00:00.000Z" },
      { specialistId: yoftahe, startAt: "2026-11-02T15:30:00.000Z" },
    ]);
    render(<ParentSupportTimes labels={labels} />);
    const links = await screen.findAllByRole("link", { name: /Nov/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      "href",
      `/services/parent-support?start=${encodeURIComponent("2026-11-02T15:00:00.000Z")}&specialist=${yoftahe}`,
    );
    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/services/parent-support");
  });

  it("explains when no times are open yet", async () => {
    mocks.loadPublic.mockResolvedValue([]);
    render(<ParentSupportTimes labels={labels} />);
    expect(await screen.findByText("No times")).toBeInTheDocument();
  });

  it("arrives at booking with the chosen time already selected", () => {
    render(
      <SlotBookingForm
        dependents={[{ id: "d1", name: "Lulit" }]}
        initialChoice={{ specialistId: yoftahe, startAt: "2026-11-02T15:30:00Z" }}
        initialSlots={[
          { specialistId: yoftahe, startAt: "2026-11-02T15:00:00.000Z", endAt: "2026-11-02T15:30:00.000Z" },
          { specialistId: yoftahe, startAt: "2026-11-02T15:30:00.000Z", endAt: "2026-11-02T16:00:00.000Z" },
        ]}
        locale="en"
        serviceType="parent_support"
        specialists={[{ id: yoftahe, name: "Yoftahe", bio: null, languages: ["en", "am"] }]}
      />,
    );
    const form = screen.getByRole("button", { name: "bookFree" }).closest("form") as HTMLFormElement;
    expect((form.elements.namedItem("startAt") as HTMLInputElement).value).toBe("2026-11-02T15:30:00.000Z");
    expect(screen.getByRole("button", { name: "bookFree" })).toBeEnabled();
  });
});
