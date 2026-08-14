import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResourceCoverPlaceholder } from "@/components/resources/resource-cover-placeholder";

describe("ResourceCoverPlaceholder", () => {
  it("renders a local, labelled visual cover for the selected category", () => {
    render(<ResourceCoverPlaceholder category="education" categoryLabel="Education" />);

    expect(screen.getByRole("img", { name: "Education" })).toHaveAttribute(
      "data-slot",
      "resource-cover-placeholder",
    );
    expect(screen.getByText("Education")).toBeVisible();
  });
});
