import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) =>
    ({
      confirm: "Confirm",
      cancel: "Cancel",
      clear: "Clear",
      earlierYears: "Earlier years",
      laterYears: "Later years",
    })[key] ?? key,
}));

import { ConfirmPicker } from "@/components/ui/confirm-picker";

function hiddenValue(container: HTMLElement, name: string) {
  return (container.querySelector(`input[name="${name}"]`) as HTMLInputElement).value;
}

describe("ConfirmPicker", () => {
  it("applies a year only after Confirm", () => {
    const { container } = render(
      <ConfirmPicker
        id="birth"
        max="2026"
        min="1900"
        mode="year"
        name="birthYear"
        placeholder="Select a year"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Select a year/ }));
    fireEvent.click(screen.getByRole("button", { name: "2019" }));
    expect(hiddenValue(container, "birthYear")).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(hiddenValue(container, "birthYear")).toBe("2019");
    expect(screen.getByRole("button", { name: /2019/ })).toBeInTheDocument();
  });

  it("discards the choice on Cancel", () => {
    const { container } = render(
      <ConfirmPicker
        defaultValue="2015"
        id="birth"
        max="2026"
        mode="year"
        name="birthYear"
        placeholder="Select a year"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /2015/ }));
    fireEvent.click(screen.getByRole("button", { name: "2020" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(hiddenValue(container, "birthYear")).toBe("2015");
  });

  it("pages through earlier years", () => {
    render(<ConfirmPicker id="birth" max="2026" min="1900" mode="year" placeholder="Select a year" />);
    fireEvent.click(screen.getByRole("button", { name: /Select a year/ }));
    expect(screen.queryByRole("button", { name: "2010" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Earlier years" }));
    expect(screen.getByRole("button", { name: "2010" })).toBeInTheDocument();
  });

  it("reports a confirmed date and time to a controlled form", () => {
    const onChange = vi.fn();
    render(
      <ConfirmPicker
        id="slot"
        mode="datetime"
        onChange={onChange}
        placeholder="Choose a date and time"
        value=""
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Choose a date and time/ }));
    fireEvent.change(screen.getByLabelText("Choose a date and time", { selector: "input" }), {
      target: { value: "2026-11-02T10:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onChange).toHaveBeenCalledWith("2026-11-02T10:30");
  });
});
