import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import Page from "@/app/[locale]/(member)/onboarding/page";

describe("legacy Getting started route", () => {
  it("redirects to the locale dashboard", async () => {
    await Page({ params: Promise.resolve({ locale: "en" }) });

    expect(mocks.redirect).toHaveBeenCalledWith("/en/dashboard");
  });
});
