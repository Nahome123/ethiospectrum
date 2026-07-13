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
  await expect(page).toHaveURL(/\/am\/login/);
  await page.goto("/es/admin");
  await expect(page).toHaveURL(/\/es\/login/);
});
