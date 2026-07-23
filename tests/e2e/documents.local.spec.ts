import { expect, test } from "@playwright/test";

const localSupabaseUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;
const isDedicatedLocalRun =
  process.env.E2E_DOCUMENTS_LOCAL_CONFIG === "1" &&
  process.env.E2E_LOCAL_SUPABASE === "1" &&
  localSupabaseUrl.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

test.describe("documents workflow (local Supabase only)", () => {
  test.skip(
    !isDedicatedLocalRun,
    "Document mutation coverage requires the dedicated local Playwright configuration.",
  );

  test("protects, uploads, downloads, and archives a synthetic household document", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const email = `documents-e2e-${suffix}@example.test`;
    const password = "Local-document-test-password-123!";
    const title = `Synthetic local document ${suffix}`;
    const filename = "synthetic-local-document.txt";

    await page.goto("/en/documents");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fdocuments$/);

    await page.goto("/en/signup");
    await page.getByLabel("First name").fill("Local");
    await page.getByLabel("Last name").fill("Document Test");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("checkbox").check();
    await Promise.all([
      page.waitForURL(/\/en\/check-email$/),
      page.getByRole("button", { name: "Create account" }).click(),
    ]);

    await page.goto("/en/onboarding");
    await page.getByLabel("Household name").fill(`Local document household ${suffix}`);
    await page.getByRole("checkbox").check();
    await Promise.all([
      page.waitForURL(/\/en\/dashboard$/),
      page.getByRole("button", { name: "Create household" }).click(),
    ]);

    await page.goto("/en/documents");
    await expect(page.getByRole("heading", { level: 1, name: "Documents" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "No uploaded documents yet" })).toBeVisible();

    for (const locale of ["am", "es"]) {
      await page.goto(`/${locale}/documents`);
      await expect(page.locator("h1")).toBeVisible();
      await page.goto(`/${locale}/documents/upload`);
      await expect(page.locator("#document-file")).toBeVisible();
    }

    await page.goto("/en/documents/upload");
    const fileInput = page.getByLabel("Choose file");
    await expect(fileInput).toBeVisible();
    await page.getByLabel("Document title").fill(title);
    await page.getByRole("button", { name: "Upload document" }).click();
    const missingFileError = page.locator("#document-file-error");
    await expect(missingFileError).toHaveAttribute("role", "alert");
    await expect(missingFileError).toHaveText("Choose a file to upload.");

    await fileInput.setInputFiles({
      name: filename,
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic local document content only."),
    });
    await page.getByRole("button", { name: "Upload document" }).click();
    await page.waitForURL(/\/en\/documents\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download" }).click();
    const downloadedFile = await download;
    expect(downloadedFile.suggestedFilename()).toBe(filename);
    await expect.poll(() => downloadedFile.failure()).toBeNull();

    page.once("dialog", (dialog) => void dialog.accept());
    await Promise.all([
      page.waitForURL(/\/en\/documents$/),
      page.getByRole("button", { name: "Archive" }).click(),
    ]);
    await expect(page.getByRole("heading", { level: 2, name: "Archived documents" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Active documents" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });
});
