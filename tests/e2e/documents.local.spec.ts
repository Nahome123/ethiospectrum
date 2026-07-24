import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const localSupabaseUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;
const isDedicatedLocalRun =
  process.env.E2E_DOCUMENTS_LOCAL_CONFIG === "1" &&
  process.env.E2E_LOCAL_SUPABASE === "1" &&
  localSupabaseUrl.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

function addSyntheticViewerMembership(householdId: string, userId: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(householdId) || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error("The local viewer fixture has an invalid identifier.");
  }
  execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_ethiospectrum-web",
      "psql",
      "--set=ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      `insert into public.household_members (household_id, user_id, permission, status, joined_at) values ('${householdId}', '${userId}', 'viewer', 'active', now())`,
    ],
    { stdio: "ignore" },
  );
}

test.describe("documents workflow (local Supabase only)", () => {
  test.skip(
    !isDedicatedLocalRun,
    "Document mutation coverage requires the dedicated local Playwright configuration.",
  );

  test("protects and organizes synthetic household documents in the binder", async ({ browser, page }) => {
    test.setTimeout(300_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const email = `documents-e2e-${suffix}@example.test`;
    const password = "Local-document-test-password-123!";
    const dependentName = "Synthetic dependent";
    const firstTitle = `Synthetic binder 00 ${suffix}`;
    const filename = "synthetic-local-document.txt";
    const householdName = `Local document household ${suffix}`;
    const localSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const localSupabaseSecret = process.env.SUPABASE_SECRET_KEY;
    if (!localSupabaseUrl || !localSupabaseSecret) {
      throw new Error("The dedicated local document test configuration is incomplete.");
    }
    const admin = createClient(localSupabaseUrl, localSupabaseSecret);

    async function uploadSyntheticDocument({
      title,
      category = "education",
      assignedToDependent = false,
      fileName = filename,
      mimeType = "text/plain",
      content = `Synthetic content for ${title}.`,
    }: {
      title: string;
      category?: "education" | "health" | "legal" | "other";
      assignedToDependent?: boolean;
      fileName?: string;
      mimeType?: "application/pdf" | "text/plain";
      content?: Buffer | string;
    }) {
      await page.goto("/en/documents/upload");
      await page.getByLabel("Document title").fill(title);
      await page.locator("#document-category").selectOption(category);
      if (assignedToDependent)
        await page.locator("#document-dependent").selectOption({ label: dependentName });
      await page.getByLabel("Choose file").setInputFiles({
        name: fileName,
        mimeType,
        buffer: Buffer.isBuffer(content) ? content : Buffer.from(content),
      });
      await page.getByRole("button", { name: "Upload document" }).click();
      await page.waitForURL(/\/en\/documents\/[0-9a-f-]{36}$/);
    }

    await page.goto("/en/documents");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fdocuments$/);

    const { error: ownerCreationError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: "Local", last_name: "Document Test", preferred_locale: "en" },
    });
    if (ownerCreationError) throw new Error("The synthetic local owner was not created.");

    await page.goto("/en/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await Promise.all([
      page.waitForURL(/\/en\/(?:dashboard|onboarding)$/),
      page.getByRole("button", { name: "Log in" }).click(),
    ]);

    await page.goto("/en/onboarding");
    await page.getByLabel("Household name").fill(householdName);
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
      await expect(page.locator("h1").first()).toBeVisible();
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
    const firstDocumentId = new URL(page.url()).pathname.split("/").at(-1);
    expect(firstDocumentId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: firstTitle })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to document binder" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
    await expect(page.locator("dl").getByLabel("Processing status: Not started")).toBeVisible();
    await expect(page.getByRole("button", { name: "Process document" })).toBeVisible();
    await expect(page.getByText("Processing is required before a summary can be generated.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate summary" })).toHaveCount(0);

    const processButton = page.getByRole("button", { name: "Process document" });
    await processButton.focus();
    await expect(processButton).toBeFocused();
    await processButton.press("Enter");
    await page.reload();
    await expect(page.locator("dl").getByLabel("Processing status: Queued")).toBeVisible();

    const rejectedWorkerRequest = await page.request.post("/api/internal/document-processing");
    expect(rejectedWorkerRequest.status()).toBe(401);

    const processingSecret = process.env.DOCUMENT_PROCESSING_SECRET;
    expect(processingSecret).toBeTruthy();
    const workerRequest = await page.request.post("/api/internal/document-processing", {
      headers: { "x-document-processing-secret": processingSecret ?? "" },
    });
    expect(workerRequest.status()).toBe(200);
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByLabel("Processing status: Completed").count();
      })
      .toBeGreaterThan(0);

    await page.goto(`/am/documents/${firstDocumentId}`);
    await expect(page.locator("dl").getByLabel("የማስኬጃ ሁኔታ: ተጠናቋል")).toBeVisible();
    await page.goto(`/es/documents/${firstDocumentId}`);
    await expect(page.locator("dl").getByLabel("Estado de procesamiento: Completado")).toBeVisible();

    if (!firstDocumentId) {
      throw new Error("The dedicated local document test configuration is incomplete.");
    }
    const { data: sourceDocument, error: sourceDocumentError } = await admin
      .from("documents")
      .select("household_id")
      .eq("id", firstDocumentId)
      .maybeSingle();
    if (sourceDocumentError || !sourceDocument)
      throw new Error("The synthetic local document was not created.");

    if (!firstDocumentId) throw new Error("The synthetic local document identifier is unavailable.");
    const [{ data: sourcePage, error: sourcePageError }, { data: sourceChunk, error: sourceChunkError }] =
      await Promise.all([
        admin
          .from("document_pages")
          .select("id, page_number, extracted_text")
          .eq("document_id", firstDocumentId)
          .maybeSingle(),
        admin
          .from("document_chunks")
          .select("id, page_id, page_number, chunk_index, content")
          .eq("document_id", firstDocumentId)
          .maybeSingle(),
      ]);
    if (sourcePageError || sourceChunkError || !sourcePage || !sourceChunk || !sourceChunk.page_id) {
      throw new Error("The synthetic local summary source is unavailable.");
    }

    // The local integration test never calls an AI provider. It drives the
    // browser request path and then completes the claimed job with a synthetic,
    // schema-valid mocked provider result through the service-only RPC.
    async function claimSummary(workerIdentity: string) {
      const { data, error } = await admin.rpc("claim_next_document_summary_job", {
        worker_identity: workerIdentity,
      });
      if (error || !data?.[0]) throw new Error("The synthetic summary job was not claimed.");
      return data[0];
    }

    await page.goto(`/en/documents/${firstDocumentId}`);
    await page.getByLabel("Summary language", { exact: true }).selectOption("en");
    await page.getByRole("button", { name: "Generate summary" }).click();
    await page.reload();
    await expect(page.getByLabel("Summary status: Summary queued")).toBeVisible();

    const firstSummaryJob = await claimSummary(`synthetic-summary-e2e-${suffix}-one`);
    await page.reload();
    await expect(page.getByLabel("Summary status: Generating summary")).toBeVisible();

    const failedSummary = await admin.rpc("fail_document_summary_job", {
      target_summary_id: firstSummaryJob.summary_id,
      expected_worker_identity: `synthetic-summary-e2e-${suffix}-one`,
      safe_error_code: "provider_timeout",
    });
    if (failedSummary.error || !failedSummary.data) {
      throw new Error("The synthetic summary failure was not recorded.");
    }
    await page.reload();
    await expect(page.getByLabel("Summary status: Summary failed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry summary" })).toBeVisible();

    await page.getByRole("button", { name: "Retry summary" }).click();
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByLabel("Summary status: Summary queued").count();
      })
      .toBeGreaterThan(0);
    const completedSummaryJob = await claimSummary(`synthetic-summary-e2e-${suffix}-two`);
    const sourceExcerpt = sourceChunk.content.trim().slice(0, 320);
    const completedSummary = await admin.rpc("complete_document_summary_job", {
      target_summary_id: completedSummaryJob.summary_id,
      expected_worker_identity: `synthetic-summary-e2e-${suffix}-two`,
      completed_summary_text: "Synthetic grounded document summary.",
      completed_structured_summary: {
        overview: {
          text: "Synthetic grounded document summary.",
          sourceKeys: ["src_001"],
        },
        keyPoints: [{ text: "Synthetic key point.", sourceKeys: ["src_001"] }],
        importantDates: [],
        actionItems: [],
        organizationsOrPeople: [],
        warningsOrUncertainties: [],
      },
      completed_source_references: [
        {
          reference_id: "source-1",
          section: "overview",
          item_index: 0,
          page_id: sourcePage.id,
          page_number: sourcePage.page_number,
          chunk_id: sourceChunk.id,
          chunk_index: sourceChunk.chunk_index,
          excerpt: sourceExcerpt,
        },
        {
          reference_id: "source-2",
          section: "keyPoints",
          item_index: 0,
          page_id: sourcePage.id,
          page_number: sourcePage.page_number,
          chunk_id: sourceChunk.id,
          chunk_index: sourceChunk.chunk_index,
          excerpt: sourceExcerpt,
        },
      ],
      completed_source_coverage: "full",
      completed_source_item_count: 1,
      completed_source_character_count: sourceChunk.content.length,
      completed_provider: "synthetic-provider",
      completed_model_identifier: "synthetic-summary-model",
      completed_provider_call_count: 2,
    });
    if (completedSummary.error || !completedSummary.data) {
      throw new Error("The synthetic summary completion was not recorded.");
    }

    await page.reload();
    await expect(page.getByLabel("Summary status: Summary completed")).toBeVisible();
    await expect(page.getByText("Synthetic grounded document summary.")).toBeVisible();
    const firstSourceLink = page.getByRole("link", { name: "Source 1" }).first();
    await firstSourceLink.focus();
    await expect(firstSourceLink).toBeFocused();
    await firstSourceLink.press("Enter");
    await expect(page.locator("#document-summary-source-0")).toBeVisible();

    await page.getByLabel("View summary language").selectOption("es");
    await Promise.all([
      page.waitForURL(/summaryLanguage=es/),
      page.getByRole("button", { name: "View summary" }).click(),
    ]);
    await page.getByLabel("Summary language", { exact: true }).selectOption("es");
    await page.getByRole("button", { name: "Generate summary" }).click();
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByLabel("Summary status: Summary queued").count();
      })
      .toBeGreaterThan(0);

    await page.getByLabel("View summary language").selectOption("am");
    await Promise.all([
      page.waitForURL(/summaryLanguage=am/),
      page.getByRole("button", { name: "View summary" }).click(),
    ]);
    await page.getByLabel("Summary language", { exact: true }).selectOption("am");
    await page.getByRole("button", { name: "Generate summary" }).click();
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByLabel("Summary status: Summary queued").count();
      })
      .toBeGreaterThan(0);

    const scannedTitle = `Synthetic scanned PDF ${suffix}`;
    await uploadSyntheticDocument({
      title: scannedTitle,
      fileName: "synthetic-scanned.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4\n% synthetic image-only fixture"),
    });
    const scannedDocumentId = new URL(page.url()).pathname.split("/").at(-1);
    expect(scannedDocumentId).toMatch(/^[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Process document" }).click();
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByLabel("Processing status: Queued").count();
      })
      .toBeGreaterThan(0);
    const claimedProcessing = await admin.rpc("claim_next_document_processing_job", {
      worker_identity: `synthetic-ocr-source-${suffix}`,
    });
    if (claimedProcessing.error || !claimedProcessing.data?.[0]) {
      throw new Error("The synthetic scanned-PDF processing job was not claimed.");
    }
    const needsOcr = await admin.rpc("complete_document_processing_job", {
      target_job_id: claimedProcessing.data[0].job_id,
      expected_worker_identity: `synthetic-ocr-source-${suffix}`,
      final_status: "needs_ocr",
      page_rows: [],
      chunk_rows: [],
    });
    if (needsOcr.error || !needsOcr.data) throw new Error("The synthetic needs-OCR state was not recorded.");

    await page.reload();
    await expect(
      page.locator("dl").getByLabel("Processing status: Scanned document — OCR required"),
    ).toBeVisible();
    const runOcrButton = page.getByRole("button", { name: "Run OCR" });
    await runOcrButton.focus();
    await expect(runOcrButton).toBeFocused();
    await runOcrButton.press("Enter");
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByText("OCR queued", { exact: true }).count();
      })
      .toBeGreaterThan(0);
    const rejectedOcrWorker = await page.request.post("/api/internal/document-ocr");
    expect(rejectedOcrWorker.status()).toBe(401);

    const claimedOcr = await admin.rpc("claim_next_document_ocr_job", {
      worker_identity: `synthetic-ocr-worker-${suffix}-one`,
    });
    if (claimedOcr.error || !claimedOcr.data?.[0]) throw new Error("The synthetic OCR job was not claimed.");
    await page.reload();
    await expect(page.getByText("OCR processing", { exact: true })).toBeVisible();
    const failedOcr = await admin.rpc("fail_document_ocr_job", {
      target_job_id: claimedOcr.data[0].job_id,
      expected_worker_identity: `synthetic-ocr-worker-${suffix}-one`,
      safe_error_code: "ocr_output_empty",
    });
    if (failedOcr.error || !failedOcr.data) throw new Error("The synthetic OCR failure was not recorded.");
    await page.reload();
    await expect(page.getByText("OCR failed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry OCR" })).toBeVisible();

    const viewerEmail = `documents-viewer-${suffix}@example.test`;
    const { data: viewerAuth, error: viewerAuthError } = await admin.auth.admin.createUser({
      email: viewerEmail,
      password,
      email_confirm: true,
    });
    if (viewerAuthError || !viewerAuth.user) throw new Error("The synthetic local viewer was not created.");
    addSyntheticViewerMembership(sourceDocument.household_id, viewerAuth.user.id);
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto("/en/login");
    await viewerPage.getByLabel("Email address").fill(viewerEmail);
    await viewerPage.getByLabel("Password").fill(password);
    await Promise.all([
      viewerPage.waitForURL(/\/en\/dashboard$/),
      viewerPage.getByRole("button", { name: "Log in" }).click(),
    ]);
    await viewerPage.goto(`/en/documents/${scannedDocumentId}`);
    await expect(viewerPage.getByRole("button", { name: "Run OCR" })).toHaveCount(0);
    await expect(viewerPage.getByRole("button", { name: "Retry OCR" })).toHaveCount(0);

    await page.getByRole("button", { name: "Retry OCR" }).click();
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByText("OCR queued", { exact: true }).count();
      })
      .toBeGreaterThan(0);
    const completedOcrClaim = await admin.rpc("claim_next_document_ocr_job", {
      worker_identity: `synthetic-ocr-worker-${suffix}-two`,
    });
    if (completedOcrClaim.error || !completedOcrClaim.data?.[0]) {
      throw new Error("The synthetic OCR retry was not claimed.");
    }
    const completedOcr = await admin.rpc("complete_document_ocr_job", {
      target_job_id: completedOcrClaim.data[0].job_id,
      expected_worker_identity: `synthetic-ocr-worker-${suffix}-two`,
      completed_provider: "synthetic-provider",
      completed_model_identifier: "synthetic-ocr-model",
      page_rows: [{ page_number: 1, content: "Hello OCR.", character_count: 10 }],
      chunk_rows: [
        { page_number: 1, chunk_index: 0, content: "Hello OCR.", character_count: 10, token_estimate: 3 },
      ],
    });
    if (completedOcr.error || !completedOcr.data)
      throw new Error("The synthetic OCR completion was not recorded.");
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByText("OCR completed", { exact: true }).count();
      })
      .toBeGreaterThan(0);
    await expect(page.getByText("Verify text against the original PDF.")).toBeVisible();
    await page.goto(`/am/documents/${scannedDocumentId}`);
    await expect(page.locator("h1")).toHaveText(scannedTitle);
    await page.goto(`/es/documents/${scannedDocumentId}`);
    await expect(page.locator("h1")).toHaveText(scannedTitle);

    await viewerPage.goto(`/en/documents/${firstDocumentId}`);
    await expect(viewerPage.getByRole("heading", { level: 1, name: firstTitle })).toBeVisible();
    await expect(viewerPage.getByRole("button", { name: "Process document" })).toHaveCount(0);
    await expect(viewerPage.getByRole("button", { name: "Generate summary" })).toHaveCount(0);
    await expect(viewerPage.getByRole("button", { name: "Generate again" })).toHaveCount(0);
    await expect(viewerPage.getByText("Synthetic grounded document summary.")).toBeVisible();
    await viewerPage.goto(`/en/documents/${scannedDocumentId}`);
    await expect(viewerPage.getByRole("button", { name: "Run OCR" })).toHaveCount(0);
    await expect(viewerPage.getByRole("button", { name: "Retry OCR" })).toHaveCount(0);
    await viewerContext.close();

    await page.goto(`/en/documents/${firstDocumentId}`);

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

    await page.getByRole("search").getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/en\/documents$/);
    await page.locator("#document-binder-desktop-dependent").selectOption({ label: dependentName });
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/dependent=/);
    await expect(page.getByRole("link", { name: `Synthetic binder 02 ${suffix}` })).toBeVisible();

    await page.getByRole("search").getByRole("link", { name: "Clear filters" }).click();
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
