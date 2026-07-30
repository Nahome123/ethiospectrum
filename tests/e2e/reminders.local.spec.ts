import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const isDedicatedLocalRun =
  process.env.E2E_DOCUMENTS_LOCAL_CONFIG === "1" && process.env.E2E_LOCAL_SUPABASE === "1";

test.describe("personal roadmap reminders (local Supabase only)", () => {
  test.skip(!isDedicatedLocalRun, "Reminder coverage requires the dedicated local Supabase configuration.");

  test("creates, edits, and cancels a personal in-app reminder", async ({ page }) => {
    test.setTimeout(180_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) throw new Error("The local reminder test configuration is incomplete.");
    const admin = createClient(url, secret);
    const email = `reminder-e2e-${suffix}@example.test`;
    const password = "Local-reminder-test-password-123!";
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw new Error("The synthetic local reminder user was not created.");
    await page.goto("/en/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await Promise.all([
      page.waitForURL(/\/en\/(?:dashboard|onboarding)$/),
      page.getByRole("button", { name: "Log in" }).click(),
    ]);
    await page.goto("/en/onboarding");
    await page.getByLabel("Household name").fill(`Reminder household ${suffix}`);
    await page.getByRole("checkbox").check();
    await Promise.all([
      page.waitForURL(/\/en\/dashboard$/),
      page.getByRole("button", { name: "Create household" }).click(),
    ]);
    await page.goto("/en/roadmap/new");
    await page.getByLabel("Title").fill(`Reminder item ${suffix}`);
    await page.getByLabel("Due date").fill("2030-12-31");
    await Promise.all([
      page.waitForURL(/\/en\/roadmap\/[0-9a-f-]{36}$/),
      page.getByRole("button", { name: "Create action item" }).click(),
    ]);
    await page.getByRole("link", { name: "Remind me" }).click();
    await page.getByLabel("Delivery time").fill("09:00");
    await page.getByRole("checkbox", { name: "I confirm this timezone is correct." }).check();
    await page.getByRole("checkbox", { name: "I agree to receive this personal in-app reminder." }).check();
    await page.getByRole("button", { name: "Save reminder" }).click();
    await expect(page.getByText("New reminder")).toBeVisible();
  });
});
