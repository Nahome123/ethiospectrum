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
    ["/es/resources", "en", /\/en\/resources$/],
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
  await page.goto("/es/admin");
  await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fadmin$/);
});

test("localized authentication entry pages render accessible forms", async ({ page }) => {
  for (const locale of ["en", "am", "es"]) {
    await page.goto(`/${locale}/login`);
    await expect(page.locator("form")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
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
