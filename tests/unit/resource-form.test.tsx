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
      category: "Category",
      coverPreview: "Cover preview",
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
});
