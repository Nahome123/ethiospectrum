import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const localSupabaseUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;
const isDedicatedLocalRun =
  process.env.E2E_LOCAL_SUPABASE === "1" && localSupabaseUrl.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

test.describe("RBT training workflow (local Supabase only)", () => {
  test.skip(
    !isDedicatedLocalRun,
    "Training mutation coverage requires the dedicated local Playwright configuration.",
  );

  test("keeps the bilingual lesson, interactions, and progress private to each signed-in user", async ({
    browser,
    page,
  }) => {
    test.setTimeout(120_000);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) throw new Error("The dedicated local training test configuration is incomplete.");

    const admin = createClient(url, secret);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerEmail = `training-owner-${suffix}@example.test`;
    const otherEmail = `training-other-${suffix}@example.test`;
    const password = "Local-training-test-password-123!";

    await page.goto("/en/training/rbt/overview");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Ftraining%2Frbt%2Foverview$/);

    const { data: owner, error: ownerError } = await admin.auth.admin.createUser({
      email: ownerEmail,
      email_confirm: true,
      password,
    });
    if (ownerError || !owner.user) throw new Error("The synthetic training owner was not created.");

    const { data: other, error: otherError } = await admin.auth.admin.createUser({
      email: otherEmail,
      email_confirm: true,
      password,
    });
    if (otherError || !other.user) throw new Error("The synthetic second training user was not created.");

    await page.goto("/en/login");
    await page.getByLabel("Email address").fill(ownerEmail);
    await page.getByLabel("Password").fill(password);
    await Promise.all([
      page.waitForURL(/\/en\/dashboard$/),
      page.getByRole("button", { name: "Log in" }).click(),
    ]);

    await page.goto("/en/training/rbt");
    await page.waitForURL(/\/en\/training\/rbt\/overview$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /Errorless Teaching & Intensive Teaching/ }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "RBT lesson sections" })).toBeVisible();
    await expect(page.getByText("What is Errorless Teaching?")).toBeVisible();

    await page.getByRole("button", { name: "Mark complete" }).click();
    await expect(page.getByRole("button", { name: "Completed" })).toBeVisible();

    await page.goto("/en/training/rbt/flashcards");
    await expect(page.getByText("Practice Questions")).toBeVisible();
    const reveal = page.getByRole("button", { name: "Reveal answer" }).first();
    await reveal.focus();
    await reveal.press("Enter");
    await expect(reveal).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("What is indirect measurement?")).toBeVisible();

    await page.goto("/en/training/rbt/glossary");
    await page.getByLabel("Search glossary").fill("intraverbal");
    await expect(page.getByText("Intraverbal")).toBeVisible();
    await expect(page.getByText("Extinction Burst")).toHaveCount(0);

    for (const locale of ["am", "es"]) {
      await page.goto(`/${locale}/training/rbt/procedure`);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("#rbt-training-content")).toBeVisible();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/training/rbt/takeaways");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await otherPage.goto("/en/login");
    await otherPage.getByLabel("Email address").fill(otherEmail);
    await otherPage.getByLabel("Password").fill(password);
    await Promise.all([
      otherPage.waitForURL(/\/en\/dashboard$/),
      otherPage.getByRole("button", { name: "Log in" }).click(),
    ]);
    await otherPage.goto("/en/training/rbt/overview");
    await expect(otherPage.getByText("Progress: 0%")).toBeVisible();
    await otherContext.close();

    await expect
      .poll(async () => {
        const { data, error } = await admin
          .from("training_progress")
          .select("last_section")
          .eq("user_id", owner.user.id)
          .maybeSingle();
        if (error) throw new Error("The synthetic owner progress could not be checked.");
        return data?.last_section;
      })
      .toBe("takeaways");

    const { data: ownerProgress, error: ownerProgressError } = await admin
      .from("training_progress")
      .select("completed_sections, last_section")
      .eq("user_id", owner.user.id)
      .maybeSingle();
    if (ownerProgressError || !ownerProgress) throw new Error("The synthetic owner progress was not stored.");
    expect(ownerProgress.completed_sections).toEqual(["overview"]);
    expect(ownerProgress.last_section).toBe("takeaways");

    const { data: otherProgress, error: otherProgressError } = await admin
      .from("training_progress")
      .select("id")
      .eq("user_id", other.user.id)
      .maybeSingle();
    if (otherProgressError) throw new Error("The synthetic second-user progress could not be checked.");
    expect(otherProgress).toBeNull();
  });
});
