import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const localSupabaseUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;
const isDedicatedLocalRun =
  process.env.E2E_LOCAL_SUPABASE === "1" &&
  process.env.E2E_ONBOARDING_LOCAL_CONFIG === "1" &&
  localSupabaseUrl.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

test.describe("family onboarding (local Supabase only)", () => {
  test.skip(!isDedicatedLocalRun, "Onboarding mutation coverage requires the dedicated local configuration.");

  test("routes, validates, creates one localized household, and keeps households isolated", async ({
    browser,
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const email = `onboarding-e2e-${suffix}@example.test`;
    const password = "Local-onboarding-test-password-123!";
    const householdName = `የናሆም ቤተሰብ ${suffix}`;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) throw new Error("The local onboarding test configuration is incomplete.");
    const admin = createClient(url, secret);

    for (const locale of ["en", "am", "es"]) {
      await page.goto(`/${locale}/onboarding`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?next=%2F${locale}%2Fonboarding$`));
    }

    const { data: owner, error: ownerError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: "Nahom", last_name: "Teshome", preferred_locale: "en" },
    });
    if (ownerError || !owner.user) throw new Error("The synthetic onboarding user was not created.");

    await page.goto("/en/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await Promise.all([
      page.waitForURL(/\/en\/onboarding$/),
      page.getByRole("button", { name: "Log in" }).click(),
    ]);

    for (const locale of ["am", "es"]) {
      await page.goto(`/${locale}/dashboard`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/onboarding$`));
    }
    await page.goto("/en/onboarding");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { level: 1, name: "Set up your household" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      )
      .toBe(true);

    await page.getByLabel("Household name").fill("   ");
    await page.getByRole("button", { name: "Create household" }).click();
    await expect(page.locator("#onboarding-household-name-error")).toContainText("Enter a household name");

    await page.getByLabel("First name").fill("ናሆም");
    await page.getByLabel("Last name (optional)").fill("ተሾመ");
    await page.getByLabel("Preferred language").selectOption("am");
    await page.getByLabel("Time zone").fill("not/a-timezone");
    await page.getByRole("button", { name: "Create household" }).click();
    await expect(page.locator("#onboarding-timezone-error")).toContainText("Enter a valid time zone");
    await page.getByLabel("Time zone").fill("Africa/Addis_Ababa");
    await page.getByLabel("Household name").fill(householdName);
    const submit = page.getByRole("button", { name: "Create household" });
    await submit.focus();
    await Promise.all([page.waitForURL(/\/en\/dashboard$/), submit.press("Enter"), submit.press("Enter")]);

    await expect(page.getByText(`${householdName} household workspace`)).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expect(page.getByText(`${householdName} household workspace`)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await page.goto("/en/onboarding");
    await expect(page).toHaveURL(/\/en\/dashboard$/);

    for (const locale of ["am", "es"]) {
      await page.goto(`/${locale}/dashboard`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard$`));
      await expect(page.locator("h1")).toBeVisible();
    }

    const [
      { count: householdCount, error: householdError },
      { count: membershipCount, error: membershipError },
    ] = await Promise.all([
      admin
        .from("households")
        .select("id", { count: "exact", head: true })
        .eq("primary_owner_id", owner.user.id),
      admin
        .from("household_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", owner.user.id)
        .eq("status", "active")
        .eq("permission", "owner"),
    ]);
    if (householdError || membershipError)
      throw new Error("The synthetic onboarding data could not be verified.");
    expect(householdCount).toBe(1);
    expect(membershipCount).toBe(1);

    const secondEmail = `onboarding-isolation-${suffix}@example.test`;
    const { error: secondUserError } = await admin.auth.admin.createUser({
      email: secondEmail,
      password,
      email_confirm: true,
      user_metadata: { first_name: "Second", last_name: "User", preferred_locale: "en" },
    });
    if (secondUserError) throw new Error("The synthetic isolation user was not created.");
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await secondPage.goto("/en/login");
    await secondPage.getByLabel("Email address").fill(secondEmail);
    await secondPage.getByLabel("Password").fill(password);
    await Promise.all([
      secondPage.waitForURL(/\/en\/onboarding$/),
      secondPage.getByRole("button", { name: "Log in" }).click(),
    ]);
    await expect(secondPage.getByText(householdName)).toHaveCount(0);
    await secondContext.close();
  });
});
