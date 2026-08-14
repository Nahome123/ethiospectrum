import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createResource: vi.fn(),
  updateResource: vi.fn(),
}));

vi.mock("@/lib/resources/actions", () => ({
  createResource: mocks.createResource,
  updateResource: mocks.updateResource,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const labels: Record<string, string> = {
      availableTo: "Feature in For You (optional)",
      availableToHint: "Optional. Check members who should see this resource in For You.",
      body: "Resource content",
      bodyHint: "Required: at least 50 characters.",
      category: "Category",
      categoryHint: "Choose the topic that best fits this resource.",
      coverPreview: "Cover preview",
      fieldTitle: "Title",
      formRequirements: "Complete the fields marked Required before creating a draft.",
      required: "Required",
      slug: "URL slug",
      slugHint: "Required: 3-120 lowercase letters, numbers, and hyphens.",
      summary: "Summary",
      summaryHint: "Required: 10-500 characters.",
      titleHint: "Required: 3-160 characters.",
      "categories.benefits": "Benefits",
      "categories.education": "Education",
      "categories.family_support": "Family support",
      "categories.general": "General",
      "categories.healthcare": "Healthcare",
      "categories.legal": "Legal",
      "categories.other": "Other",
      "categories.therapy": "Therapy",
    };
    return (key: string) => labels[key] ?? key;
  },
}));

import { ResourceForm } from "@/components/resources/resource-form";

describe("ResourceForm", () => {
  beforeEach(() => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  });

  afterEach(() => vi.restoreAllMocks());

  it("updates the category cover preview before an administrator creates the draft", () => {
    render(<ResourceForm locale="en" />);

    expect(screen.getByRole("img", { name: "General" })).toBeVisible();

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "healthcare" } });

    expect(screen.getByRole("img", { name: "Healthcare" })).toBeVisible();
  });

  it("shows field requirements and makes For You selection optional", () => {
    render(
      <ResourceForm
        accountHolders={[{ id: "10000000-0000-4000-8000-000000000001", label: "Michael Bekele" }]}
        locale="en"
      />,
    );

    expect(screen.getByText("Complete the fields marked Required before creating a draft.")).toBeVisible();
    expect(screen.getByText("Required: 3-160 characters.")).toBeVisible();
    expect(screen.getByLabelText(/Title/u)).toBeRequired();
    expect(screen.getByLabelText(/Resource content/u)).toHaveAttribute("minlength", "50");
    expect(screen.getByRole("checkbox", { name: "Michael Bekele" })).not.toBeRequired();
    expect(
      screen.getByText("Optional. Check members who should see this resource in For You."),
    ).toBeVisible();
  });
});
