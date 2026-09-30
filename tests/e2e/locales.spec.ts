import { expect, test } from "@playwright/test";

test("root redirects to English", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
});
test("supported locales render localized landing pages", async ({ page }) => {
  for (const locale of ["en", "am", "es"]) {
    await page.goto(`/${locale}`);
    await expect(page.locator("h1")).toBeVisible();
  }
});
test("landing page presents the three PRD services with launch prices", async ({ page }) => {
  await page.goto("/en");
  await expect(
    page.getByRole("heading", { name: "Support for your family, in your language" }),
  ).toBeVisible();
  await expect(page.getByText("$9.99").first()).toBeVisible();
  await expect(page.getByText("$19.99").first()).toBeVisible();
  await expect(
    page.getByText("no RBT Boot Camp subscription required", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "See services and prices" })).toHaveAttribute(
    "href",
    "/en/pricing",
  );
  // Retired demo destinations are no longer linked.
  await expect(page.locator('a[href="/en/assistant"]')).toHaveCount(0);

  await page.goto("/am");
  await expect(page.getByRole("heading", { name: "ለቤተሰብዎ ድጋፍ፣ በቋንቋዎ" })).toBeVisible();
});
test("landing and pricing reflow without horizontal overflow", async ({ page }) => {
  for (const path of ["/en", "/en/pricing"]) {
    for (const width of [320, 375, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
});
test("retired demo routes are not exposed", async ({ page }) => {
  for (const path of ["/en/resources", "/en/training/rbt-preview"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
  }
});
test("language selector preserves the current route", async ({ page }) => {
  await page.goto("/en/features");
  await page.getByLabel("Choose display language").selectOption("es");
  await expect(page).toHaveURL(/\/es\/features$/);
});
test("language selector changes locale from the locale home route", async ({ page }) => {
  await page.goto("/am");
  await page.locator("select").first().selectOption("en");
  await expect(page).toHaveURL(/\/en$/);
});
test("language selector does not nest locale prefixes", async ({ page }) => {
  const combinations = [
    ["/en", "am", /\/am$/],
    ["/am", "es", /\/es$/],
    ["/es/pricing", "en", /\/en\/pricing$/],
  ] as const;
  for (const [path, locale, expectedUrl] of combinations) {
    await page.goto(path);
    await page.locator("select").first().selectOption(locale);
    await expect(page).toHaveURL(expectedUrl);
  }
});
test("mobile navigation is keyboard accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
});
test("protected member and administrator paths redirect to localized login", async ({ page }) => {
  await page.goto("/am/dashboard");
  await expect(page).toHaveURL(/\/am\/login\?next=%2Fam%2Fdashboard$/);
  await page.goto("/am/documents");
  await expect(page).toHaveURL(/\/am\/login\?next=%2Fam%2Fdocuments$/);
  await page.goto("/am/dependents");
  await expect(page).toHaveURL(/\/am\/login\?next=%2Fam%2Fdependents$/);
  await page.goto("/am/dependents/new");
  await expect(page).toHaveURL(/\/am\/login\?next=%2Fam%2Fdependents%2Fnew$/);
  await page.goto("/am/training");
  await expect(page).toHaveURL(/\/am\/login\?next=%2Fam%2Ftraining$/);
  await page.goto("/am/training/rbt/flashcards");
  await expect(page).toHaveURL(/\/am\/login\?next=%2Fam%2Ftraining%2Frbt%2Fflashcards$/);
  await page.goto("/es/admin");
  await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fadmin$/);
});

test("localized authentication entry pages render accessible forms", async ({ page }) => {
  for (const locale of ["en", "am", "es"]) {
    await page.goto(`/${locale}/login`);
    await expect(page.locator("form")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator(`a[href="/${locale}/login?next=%2F${locale}%2Fadmin"]`)).toBeVisible();
    await page.goto(`/${locale}/login?next=/${locale}/admin`);
    await expect(page.locator("form")).toBeVisible();
    await page.goto(`/${locale}/signup`);
    await expect(page.locator('input[type="checkbox"]')).toBeVisible();
    await page.goto(`/${locale}/forgot-password`);
    await expect(page.locator("form")).toBeVisible();
    await page.goto(`/${locale}/resend-confirmation`);
    await expect(page.locator("form")).toBeVisible();
    await page.goto(`/${locale}/check-email`);
    await expect(page.locator(`a[href="/${locale}/resend-confirmation"]`)).toBeVisible();
  }
});

test("invalid confirmation links redirect to the localized authentication error page", async ({ page }) => {
  await page.goto("/auth/confirm?next=/am/dashboard");
  await expect(page).toHaveURL(/\/am\/auth-error\?reason=invalid$/);
});

test("reset-password routes require a valid recovery session", async ({ page }) => {
  await page.goto("/es/reset-password");
  await expect(page).toHaveURL(/\/es\/forgot-password$/);
});
