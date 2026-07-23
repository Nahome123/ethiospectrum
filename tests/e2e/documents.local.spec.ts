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

  test("protects and organizes synthetic household documents in the binder", async ({ page }) => {
    test.setTimeout(180_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const email = `documents-e2e-${suffix}@example.test`;
    const password = "Local-document-test-password-123!";
    const dependentName = "Synthetic dependent";
    const firstTitle = `Synthetic binder 00 ${suffix}`;
    const filename = "synthetic-local-document.txt";

    async function uploadSyntheticDocument({
      title,
      category = "education",
      assignedToDependent = false,
    }: {
      title: string;
      category?: "education" | "health" | "legal" | "other";
      assignedToDependent?: boolean;
    }) {
      await page.goto("/en/documents/upload");
      await page.getByLabel("Document title").fill(title);
      await page.locator("#document-category").selectOption(category);
      if (assignedToDependent)
        await page.locator("#document-dependent").selectOption({ label: dependentName });
      await page.getByLabel("Choose file").setInputFiles({
        name: filename,
        mimeType: "text/plain",
        buffer: Buffer.from(`Synthetic content for ${title}.`),
      });
      await page.getByRole("button", { name: "Upload document" }).click();
      await page.waitForURL(/\/en\/documents\/[0-9a-f-]{36}$/);
    }

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
    await expect(page.getByRole("heading", { level: 1, name: "Document binder" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "No uploaded documents yet" })).toBeVisible();

    for (const locale of ["am", "es"]) {
      await page.goto(`/${locale}/documents`);
      await expect(page.locator("h1")).toBeVisible();
      await page.goto(`/${locale}/documents/upload`);
      await expect(page.locator("#document-file")).toBeVisible();
    }

    await page.goto("/en/documents/upload");
    const fileInput = page.getByLabel("Choose file");
    await expect(fileInput).toBeVisible();
    await page.getByLabel("Document title").fill(firstTitle);
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
    await expect(page.getByRole("heading", { level: 1, name: firstTitle })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to document binder" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download" }).click();
    const downloadedFile = await download;
    expect(downloadedFile.suggestedFilename()).toBe(filename);
    await expect.poll(() => downloadedFile.failure()).toBeNull();

    await page.goto("/en/dependents/new");
    await page.getByLabel("First name").fill(dependentName);
    await Promise.all([
      page.waitForURL(/\/en\/dependents$/),
      page.getByRole("button", { name: "Save dependent" }).click(),
    ]);

    for (let index = 1; index <= 12; index += 1) {
      await uploadSyntheticDocument({
        title: `Synthetic binder ${String(index).padStart(2, "0")} ${suffix}`,
        category: index % 2 === 0 ? "health" : "education",
        assignedToDependent: index % 2 === 0,
      });
    }

    await page.goto("/en/documents");
    await page.locator("#document-binder-desktop-search").fill("Synthetic binder");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/q=Synthetic\+binder/);
    await expect(page.getByText("13 results")).toBeVisible();
    await page.getByRole("link", { name: "Next page" }).click();
    await expect(page).toHaveURL(/q=Synthetic\+binder.*page=2/);

    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/en\/documents$/);
    await page.locator("#document-binder-desktop-dependent").selectOption({ label: dependentName });
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/dependent=/);
    await expect(page.getByRole("link", { name: `Synthetic binder 02 ${suffix}` })).toBeVisible();

    await page.getByRole("link", { name: "Clear filters" }).click();
    await page.locator("#document-binder-desktop-upload-status").selectOption("uploaded");
    await page.locator("#document-binder-desktop-sort").selectOption("title_asc");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/uploadStatus=uploaded.*sort=title_asc/);
    await expect(page.getByRole("link", { name: firstTitle })).toBeVisible();
    await expect(page.locator("article a.font-bold").first()).toHaveText(firstTitle);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Filters" }).press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByLabel("Search documents")).toBeVisible();
    await page.getByRole("button", { name: "Close filters" }).press("Enter");

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/en/documents?q=${encodeURIComponent(firstTitle)}`);
    await page.getByRole("link", { name: firstTitle }).click();
    page.once("dialog", (dialog) => void dialog.accept());
    await Promise.all([
      page.waitForURL(/\/en\/documents$/),
      page.getByRole("button", { name: "Archive" }).click(),
    ]);
    await expect(page.getByRole("link", { name: firstTitle })).toHaveCount(0);
    await page.goto("/en/documents?uploadStatus=archived");
    await expect(page.getByRole("link", { name: firstTitle })).toBeVisible();
  });
});
