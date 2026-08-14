import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
};

const mocks = vi.hoisted(() => ({
  createServerComponentSupabaseClient: vi.fn(),
  getDependentContext: vi.fn(),
  getDocumentDashboardSummary: vi.fn(),
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
  Link: ({ children, href, ...props }: TestLinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/dependents/server", () => ({
  getDependentContext: mocks.getDependentContext,
}));
vi.mock("@/lib/documents/binder-query", () => ({
  getDocumentDashboardSummary: mocks.getDocumentDashboardSummary,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerComponentSupabaseClient: mocks.createServerComponentSupabaseClient,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import DashboardPage from "@/app/[locale]/(member)/dashboard/page";

type QueryResult = { count?: number; data?: unknown[] };

function createQuery(result: QueryResult) {
  const promise = Promise.resolve(result);
  return {
    eq() {
      return this;
    },
    is() {
      return this;
    },
    limit() {
      return this;
    },
    order() {
      return this;
    },
    then: promise.then.bind(promise),
  };
}

describe("Dashboard household setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDocumentDashboardSummary.mockResolvedValue({
      activeCount: 0,
      completedCount: 0,
      context: null,
      failedCount: 0,
      needsOcrCount: 0,
      pendingCount: 0,
      processingCount: 0,
      processingFailedCount: 0,
      recentDocuments: [],
    });
    mocks.createServerComponentSupabaseClient.mockResolvedValue({
      from: () => ({
        select: (_columns: string, options?: { head?: boolean }) =>
          createQuery(options?.head ? { count: 0 } : { data: [] }),
      }),
    });
  });

  it("shows household creation directly on Dashboard when no household is active", async () => {
    mocks.getDependentContext.mockResolvedValue(null);

    render(await DashboardPage({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getByText("Create household form")).toBeVisible();
    expect(mocks.getDocumentDashboardSummary).not.toHaveBeenCalled();
    expect(mocks.createServerComponentSupabaseClient).not.toHaveBeenCalled();
  });

  it("keeps household editing on Dashboard for household managers", async () => {
    mocks.getDependentContext.mockResolvedValue({
      canManage: true,
      household: { id: "household-id", name: "Teshome family" },
      permission: "owner",
      userId: "user-id",
    });

    render(await DashboardPage({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getByText("Edit household form for Teshome family")).toBeVisible();
  });
});
