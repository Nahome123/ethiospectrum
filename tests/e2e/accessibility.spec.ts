import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("English landing page has no automated axe violations", async ({ page }) => {
  await page.goto("/en");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
