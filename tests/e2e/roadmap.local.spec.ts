import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const localSupabaseUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;
const isDedicatedLocalRun =
  process.env.E2E_DOCUMENTS_LOCAL_CONFIG === "1" &&
  process.env.E2E_LOCAL_SUPABASE === "1" &&
  localSupabaseUrl.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

test.describe("household roadmap (local Supabase only)", () => {
  test.skip(!isDedicatedLocalRun, "Roadmap mutation coverage requires the dedicated local configuration.");

  test("creates, updates, archives, and restores a synthetic household action item", async ({ page }) => {
    test.setTimeout(180_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const email = `roadmap-e2e-${suffix}@example.test`;
    const password = "Local-roadmap-test-password-123!";
    const title = `Synthetic roadmap action ${suffix}`;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) throw new Error("The local roadmap test configuration is incomplete.");
    const admin = createClient(url, secret);
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error("The synthetic local roadmap owner was not created.");

    await page.goto("/en/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await Promise.all([
      page.waitForURL(/\/en\/(?:dashboard|onboarding)$/),
      page.getByRole("button", { name: "Log in" }).click(),
    ]);
    await page.goto("/en/onboarding");
    await page.getByLabel("Household name").fill(`Local roadmap household ${suffix}`);
    await page.getByRole("checkbox").check();
    await Promise.all([
      page.waitForURL(/\/en\/dashboard$/),
      page.getByRole("button", { name: "Create household" }).click(),
    ]);

    await page.goto("/en/roadmap");
    await page.getByRole("link", { name: "New action item" }).click();
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Synthetic roadmap description.");
    await page.getByLabel("Due date").fill("2026-08-01");
    await Promise.all([
      page.waitForURL(/\/en\/roadmap\/[0-9a-f-]{36}$/),
      page.getByRole("button", { name: "Create action item" }).click(),
    ]);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Edit action item" }).click();
    await page.getByLabel("Status").selectOption("completed");
    await Promise.all([
      page.waitForURL(/\/en\/roadmap\/[0-9a-f-]{36}$/),
      page.getByRole("button", { name: "Save changes" }).click(),
    ]);
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await Promise.all([
      page.waitForURL(/\/en\/roadmap$/),
      page.getByRole("button", { name: "Archive" }).click(),
    ]);
    await page.goto("/en/roadmap?archived=1");
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
    await page.waitForURL(/\/en\/roadmap\/[0-9a-f-]{36}$/);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  });
});
