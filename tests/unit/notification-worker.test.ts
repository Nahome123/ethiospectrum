import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  deliverNotificationEmails: vi.fn(),
  secret: "n".repeat(40) as string | undefined,
}));

vi.mock("@/lib/env/server", () => ({ getNotificationWorkerSecret: () => mocks.secret }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/notifications/email", () => ({ deliverNotificationEmails: mocks.deliverNotificationEmails }));

import { GET, POST } from "@/app/api/workers/notifications/route";

describe("notification worker route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.secret = "n".repeat(40);
    mocks.rpc.mockResolvedValue({ data: 2, error: null });
    mocks.deliverNotificationEmails.mockResolvedValue({ claimed: 3, sent: 3, skipped: 0, failed: 0 });
  });

  it("rejects callers without the worker secret before touching the database", async () => {
    const response = await POST(
      new Request("http://localhost/api/workers/notifications", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const response = await POST(
      new Request("http://localhost/api/workers/notifications", {
        method: "POST",
        headers: { "x-notification-worker-secret": "x".repeat(40) },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("fails closed when no secret is configured", async () => {
    mocks.secret = undefined;
    const response = await POST(
      new Request("http://localhost/api/workers/notifications", {
        method: "POST",
        headers: { "x-notification-worker-secret": "n".repeat(40) },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("queues reminders and returns aggregate counts only", async () => {
    const response = await POST(
      new Request("http://localhost/api/workers/notifications", {
        method: "POST",
        headers: { "x-notification-worker-secret": "n".repeat(40) },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("queue_service_appointment_reminders");
    await expect(response.json()).resolves.toEqual({
      remindersQueued: 2,
      claimed: 3,
      sent: 3,
      skipped: 0,
      failed: 0,
    });
  });

  it("accepts a bearer token for platform cron schedulers", async () => {
    const response = await GET(
      new Request("http://localhost/api/workers/notifications", {
        headers: { authorization: `Bearer ${"n".repeat(40)}` },
      }),
    );
    expect(response.status).toBe(200);
  });
});

describe("notification scheduler workflow", () => {
  it("validates an exact HTTPS origin before sending the secret as a header", () => {
    const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/notifications.yml"), "utf8");
    expect(workflow).toContain("permissions: {}");
    expect(workflow).not.toContain("actions/checkout");
    expect(workflow).toContain('url.protocol !== "https:"');
    expect(workflow).toContain("value !== url.origin");
    expect(workflow).toContain('"x-notification-worker-secret: $NOTIFICATION_WORKER_SECRET"');
    expect(workflow).not.toMatch(/(?:echo|console\.(?:log|error))[^\n]*NOTIFICATION_WORKER_SECRET/u);
  });
});
