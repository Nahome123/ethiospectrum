import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
};

const mocks = vi.hoisted(() => ({
  getHouseholdAccess: vi.fn(),
  listHouseholdServiceRequests: vi.fn(),
  listUpcomingAppointments: vi.fn(),
  listServices: vi.fn(),
  listDependentOptions: vi.fn(),
  getTrainingAccess: vi.fn(),
  getTrainingProgressSummary: vi.fn(),
  getHouseholdBillingSummary: vi.fn(),
}));

vi.mock("@/components/onboarding/onboarding-form", () => ({
  OnboardingForm: () => <div>Create household form</div>,
}));
vi.mock("@/components/services/status-badge", () => ({
  ServiceStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  PaymentStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  StatusPill: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: TestLinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/households/server", () => ({ getHouseholdAccess: mocks.getHouseholdAccess }));
vi.mock("@/lib/services/server", () => ({
  listHouseholdServiceRequests: mocks.listHouseholdServiceRequests,
  listUpcomingAppointments: mocks.listUpcomingAppointments,
  listServices: mocks.listServices,
  listDependentOptions: mocks.listDependentOptions,
}));
vi.mock("@/lib/training/server", () => ({
  getTrainingAccess: mocks.getTrainingAccess,
  getTrainingProgressSummary: mocks.getTrainingProgressSummary,
}));
vi.mock("@/lib/billing/server", () => ({ getHouseholdBillingSummary: mocks.getHouseholdBillingSummary }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import DashboardPage from "@/app/[locale]/(member)/dashboard/page";

const props = { params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) };

describe("Customer dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listHouseholdServiceRequests.mockResolvedValue([]);
    mocks.listUpcomingAppointments.mockResolvedValue([]);
    mocks.listServices.mockResolvedValue([]);
    mocks.listDependentOptions.mockResolvedValue([]);
    mocks.getTrainingAccess.mockResolvedValue({
      hasAccess: false,
      hasSubscription: false,
      canSubscribe: true,
      isAdministrator: false,
    });
    mocks.getTrainingProgressSummary.mockResolvedValue([]);
    mocks.getHouseholdBillingSummary.mockResolvedValue(null);
  });

  it("shows household creation when the account has no household", async () => {
    mocks.getHouseholdAccess.mockResolvedValue(null);
    render(await DashboardPage(props));
    expect(screen.getByText("Create household form")).toBeVisible();
    expect(mocks.listHouseholdServiceRequests).not.toHaveBeenCalled();
  });

  it("surfaces pending payments, the subscription state, and independent purchases", async () => {
    mocks.getHouseholdAccess.mockResolvedValue({
      household: { id: "household-id", name: "Teshome household" },
      permission: "owner",
      isOwner: true,
      permissions: ["submit_requests", "make_payments"],
    });
    mocks.listHouseholdServiceRequests.mockImplementation(async (status: string) =>
      status === "active"
        ? [
            {
              id: "request-1",
              service_type: "consultation",
              dependent_name: "Nati",
              status: "awaiting_payment",
              payment_status: "unpaid",
              amount_cents: 999,
              updated_at: "2026-09-29T12:00:00Z",
            },
          ]
        : [],
    );
    render(await DashboardPage(props));
    expect(screen.getByText("Teshome household")).toBeVisible();
    expect(screen.getByText("pendingPayments")).toBeVisible();
    expect(screen.getByRole("link", { name: "payNow" })).toHaveAttribute("href", "/requests/request-1");
    expect(screen.getByText("subscriptionInactive")).toBeVisible();
    expect(screen.getByText("independentNotice")).toBeVisible();
    expect(screen.getByRole("link", { name: "requestService" })).toHaveAttribute("href", "/services");
  });
});
