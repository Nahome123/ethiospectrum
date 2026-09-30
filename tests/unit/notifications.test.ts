import { describe, expect, it, vi } from "vitest";
import {
  notificationTypeValues,
  notificationValues,
  safeNotificationPath,
} from "@/lib/notifications/content";

vi.mock("@/lib/auth/site-url", () => ({ getSiteUrl: () => "https://app.ethiospectrum.test" }));

import { renderNotificationEmail } from "@/lib/notifications/email";

describe("notification content", () => {
  it("interpolates only safe payload values", () => {
    const values = notificationValues(
      { service_type: "consultation", start_at: "2026-10-15T19:30:00Z", amount_cents: 999, secret: "x" },
      {
        serviceName: (type) => `name:${type}`,
        formatDate: (iso) => `date:${iso}`,
        formatAmount: (cents) => `amount:${cents}`,
      },
    );
    expect(values).toEqual({
      service: "name:consultation",
      start: "date:2026-10-15T19:30:00Z",
      amount: "amount:999",
      household: "",
    });
  });

  it("renders only relative in-app links", () => {
    expect(safeNotificationPath("/requests/abc")).toBe("/requests/abc");
    expect(safeNotificationPath("https://evil.example")).toBeNull();
    expect(safeNotificationPath("//evil.example")).toBeNull();
    expect(safeNotificationPath("/requests/<script>")).toBeNull();
  });
});

describe("notification email rendering", () => {
  it.each(["en", "am", "es"])(
    "renders every notification type in %s without missing messages",
    async (locale) => {
      for (const type of notificationTypeValues) {
        const email = await renderNotificationEmail({
          locale,
          firstName: "Hana",
          type,
          payload: {
            service_type: "iep_language_assistance",
            start_at: "2026-10-15T19:30:00Z",
            amount_cents: 1999,
            household_name: "Bekele household",
          },
          linkPath: "/requests/30000000-0000-4000-8000-000000000001",
        });
        expect(email, `${locale}:${type}`).not.toBeNull();
        expect(email!.subject).not.toContain("notifications.");
        expect(email!.text).not.toContain("notifications.");
        expect(email!.text).toContain(`https://app.ethiospectrum.test/${locale}/requests/`);
      }
    },
  );

  it("escapes HTML in interpolated values", async () => {
    const email = await renderNotificationEmail({
      locale: "en",
      firstName: "<b>x</b>",
      type: "caregiver_invitation",
      payload: { household_name: "<script>alert(1)</script>" },
      linkPath: "/invitations/abc",
    });
    expect(email!.html).not.toContain("<script>");
    expect(email!.html).toContain("&#60;script&#62;");
  });

  it("does not render unknown notification types", async () => {
    await expect(
      renderNotificationEmail({
        locale: "en",
        firstName: null,
        type: "unknown_type",
        payload: {},
        linkPath: null,
      }),
    ).resolves.toBeNull();
  });
});
