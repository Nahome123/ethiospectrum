import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { day?: string }) =>
    values?.day ? `${values.day} ${key}` : key,
}));

import { WeeklyHoursFields } from "@/components/specialists/weekly-hours-fields";

function submitted(container: HTMLElement) {
  return Object.fromEntries(new FormData(container.querySelector("form")!));
}

describe("WeeklyHoursFields", () => {
  it("leaves days unavailable until switched on, then offers a half-hour range", async () => {
    const { container } = render(
      <form>
        <WeeklyHoursFields hours={[{ weekday: 1, start: "10:00:00", end: "12:30:00" }]} />
      </form>,
    );
    expect(screen.getAllByText("dayClosed")).toHaveLength(6);
    expect(screen.getByLabelText("Monday startsAt")).toHaveValue("10:00");

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    const tuesdayEnd = screen.getByLabelText("Tuesday endsAt");
    // A newly opened day copies the hours of the open day above it.
    expect(screen.getByLabelText("Tuesday startsAt")).toHaveValue("10:00");
    expect(tuesdayEnd).toHaveValue("12:30");
    expect([...tuesdayEnd.querySelectorAll("option")].every((option) => /:(00|30)$/.test(option.value))).toBe(
      true,
    );

    // A start after the end moves the end along so the range stays valid.
    fireEvent.change(screen.getByLabelText("Tuesday startsAt"), { target: { value: "18:00" } });
    expect(tuesdayEnd).toHaveValue("19:00");

    // React resets the form after saving; the chosen hours must stay on screen.
    act(() => container.querySelector("form")!.reset());
    await waitFor(() => expect(screen.getByLabelText("Tuesday endsAt")).toHaveValue("19:00"));
    expect(screen.getByLabelText("Tuesday startsAt")).toHaveValue("18:00");

    expect(screen.getAllByRole("checkbox")[1]).toBeChecked();
    expect(submitted(container)).toEqual({
      "start.1": "10:00",
      "end.1": "12:30",
      "start.2": "18:00",
      "end.2": "19:00",
    });
  });
});
