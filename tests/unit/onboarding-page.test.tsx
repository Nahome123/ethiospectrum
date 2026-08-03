import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
  locale?: string;
};

const mocks = vi.hoisted(() => ({
  getCurrentHouseholdContext: vi.fn(),
}));

vi.mock("@/lib/households/server", () => ({
  getCurrentHouseholdContext: mocks.getCurrentHouseholdContext,
}));
vi.mock("@/components/onboarding/household-edit-form", () => ({
  HouseholdEditForm: ({ householdName }: { householdName: string }) => (
    <div>Edit household form for {householdName}</div>
  ),
}));
vi.mock("@/components/onboarding/onboarding-form", () => ({
  OnboardingForm: () => <div>Create household form</div>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, locale, ...props }: TestLinkProps) => (
    <a data-locale={locale} href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import Page from "@/app/[locale]/(member)/onboarding/page";

describe("Getting Started household UI", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows household creation when onboarding has not been completed", async () => {
    mocks.getCurrentHouseholdContext.mockResolvedValue(null);

    render(await Page({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getByText("Create household form")).toBeVisible();
    expect(screen.queryByText(/Edit household form/u)).not.toBeInTheDocument();
  });

  it("shows household editing to owners and administrators", async () => {
    mocks.getCurrentHouseholdContext.mockResolvedValue({
      household: { id: "household-id", name: "Teshome family" },
      permission: "owner",
      canManage: true,
    });

    render(await Page({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getByText("Edit household form for Teshome family")).toBeVisible();
  });

  it("does not expose household editing to non-managing members", async () => {
    mocks.getCurrentHouseholdContext.mockResolvedValue({
      household: { id: "household-id", name: "Teshome family" },
      permission: "member",
      canManage: false,
    });

    render(await Page({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getByText("completeTitle")).toBeVisible();
    expect(screen.queryByText(/Edit household form/u)).not.toBeInTheDocument();
  });
});
