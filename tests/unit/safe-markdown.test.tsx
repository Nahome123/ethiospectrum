import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeMarkdown } from "@/components/resources/safe-markdown";

describe("SafeMarkdown", () => {
  it("renders allowlisted Markdown while keeping raw HTML and unsafe schemes inert", () => {
    const { container } = render(
      <SafeMarkdown
        body={[
          "# Safe heading",
          "- First item\n- Second item",
          "```js\nalert('literal')\n```",
          "[HTTPS](https://example.com) and [HTTP](http://example.com)",
          "<script>alert('unsafe')</script>",
          "<img src=x onerror=alert(1)>",
          "[unsafe](javascript:alert(1)) and [data](data:text/html,alert(1))",
        ].join("\r\n\r\n")}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Safe heading" })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector("code")).toHaveTextContent("alert('literal')");
    expect(screen.getByRole("link", { name: "HTTPS" })).toHaveAttribute("rel", "noreferrer noopener");
    expect(screen.getByRole("link", { name: "HTTP" })).toHaveAttribute("href", "http://example.com");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('[href^="data:"]')).toBeNull();
    expect(screen.getByText(/<script>alert/)).toBeVisible();
    expect(screen.getByText(/<img src=x onerror/)).toBeVisible();
  });
});
