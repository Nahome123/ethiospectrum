import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const localSupabaseUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;
const isDedicatedLocalRun =
  process.env.E2E_DOCUMENTS_LOCAL_CONFIG === "1" &&
  process.env.E2E_LOCAL_SUPABASE === "1" &&
  localSupabaseUrl.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

const password = "Local-specialist-test-password-123!";
const uuidShape = /^[0-9a-f-]{36}$/i;
const fixtureNameShape = /^[A-Za-z0-9 -]+$/;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("The local specialist test configuration is incomplete.");
  return createClient(url, secret);
}

/** Runs synthetic fixture SQL against the local database container only. */
function runLocalSql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_ethiospectrum-web",
      "psql",
      "--set=ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

function requireUuid(value: string, label: string): string {
  if (!uuidShape.test(value)) throw new Error(`The local specialist fixture has an invalid ${label}.`);
  return value;
}

function lookUpHouseholdId(name: string): string {
  if (!fixtureNameShape.test(name)) throw new Error("The local specialist fixture name is invalid.");
  return requireUuid(runLocalSql(`select id from public.households where name = '${name}'`), "household id");
}

async function createConfirmedUser(email: string, label: string) {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Synthetic", last_name: label, preferred_locale: "en" },
  });
  if (error || !data.user) throw new Error("The synthetic local specialist user was not created.");
  return requireUuid(data.user.id, "user id");
}

function setGlobalRole(userId: string, role: "administrator" | "specialist" | "content_editor") {
  runLocalSql(
    `update public.user_roles set role = '${role}' where user_id = '${requireUuid(userId, "user id")}'`,
  );
}

function createSpecialistProfile(userId: string, availability: "available" | "unavailable" = "available") {
  runLocalSql(
    `insert into public.specialists (user_id, availability_status, languages, specialties) values ('${requireUuid(userId, "user id")}', '${availability}', array['English'], array['Education'])`,
  );
  return requireUuid(
    runLocalSql(`select id from public.specialists where user_id = '${userId}'`),
    "specialist id",
  );
}

/**
 * The Next dev server occasionally answers with its root not-found shell while a
 * route is still compiling. Retry that specific case once so a compile race is
 * not mistaken for a routing defect.
 */
async function gotoStable(page: Page, path: string) {
  await page.goto(path);
  const notFound = page.getByText("This page could not be found.");
  if (await notFound.isVisible().catch(() => false)) {
    await page.waitForTimeout(2000);
    await page.goto(path);
  }
}

async function logIn(page: Page, email: string) {
  await gotoStable(page, "/en/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(/\/en\/(?:dashboard|onboarding)$/),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
}

async function logOut(page: Page) {
  // Denial pages render no shell, so always sign out from a shell-bearing route.
  await gotoStable(page, "/en/dashboard");
  await Promise.all([page.waitForURL(/\/en\/login$/), page.getByRole("button", { name: "Log out" }).click()]);
}

async function completeOnboarding(page: Page, householdName: string) {
  await gotoStable(page, "/en/onboarding");
  await page.getByLabel("Household name").fill(householdName);
  await page.getByRole("checkbox").check();
  await Promise.all([
    page.waitForURL(/\/en\/dashboard$/),
    page.getByRole("button", { name: "Create household" }).click(),
  ]);
}

async function createRequest(page: Page, subject: string, description: string) {
  await gotoStable(page, "/en/support/new");
  await page.getByLabel("Subject *").fill(subject);
  await page.getByLabel("What do you need help with? *").fill(description);
  await page.getByRole("checkbox").check();
  await Promise.all([
    page.waitForURL(/\/en\/support\/[0-9a-f-]{36}$/),
    page.getByRole("button", { name: "Submit request" }).click(),
  ]);
  return page.url();
}

test.describe("specialist assignment (local Supabase only)", () => {
  test.skip(
    !isDedicatedLocalRun,
    "Specialist assignment coverage requires the dedicated local configuration.",
  );

  test("denies logged-out and non-administrator access to assignment surfaces", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/en/admin/specialists");
    await expect(page).toHaveURL(/\/en\/login/);
    await page.goto("/en/specialist/support-requests");
    await expect(page).toHaveURL(/\/en\/login/);

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerEmail = `spec-denial-owner-${suffix}@example.test`;
    await createConfirmedUser(ownerEmail, "owner");
    await logIn(page, ownerEmail);
    await completeOnboarding(page, `Denial household ${suffix}`);

    // A household user holds no global role, so both surfaces stay denied.
    await page.goto("/en/admin/specialists");
    await expect(page).toHaveURL(/auth-error\?reason=access-denied/);
    await page.goto("/en/specialist/support-requests");
    await expect(page).toHaveURL(/auth-error\?reason=access-denied/);
  });

  test("administrator assigns a specialist who then responds, and the household sees it", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerEmail = `spec-owner-${suffix}@example.test`;
    const adminEmail = `spec-admin-${suffix}@example.test`;
    const specialistEmail = `spec-worker-${suffix}@example.test`;
    const otherSpecialistEmail = `spec-other-${suffix}@example.test`;
    const editorEmail = `spec-editor-${suffix}@example.test`;
    const subject = `Assignment request ${suffix}`;

    await createConfirmedUser(ownerEmail, "owner");
    await logIn(page, ownerEmail);
    await completeOnboarding(page, `Specialist household ${suffix}`);
    const requestUrl = await createRequest(
      page,
      subject,
      "A synthetic request that an administrator will assign to a specialist.",
    );
    const requestId = requestUrl.split("/").at(-1) ?? "";
    await expect(page.getByText("No specialist assigned")).toBeVisible();
    await logOut(page);

    const adminId = await createConfirmedUser(adminEmail, "admin");
    setGlobalRole(adminId, "administrator");
    const specialistUserId = await createConfirmedUser(specialistEmail, "worker");
    setGlobalRole(specialistUserId, "specialist");
    const assignedSpecialistId = createSpecialistProfile(specialistUserId);
    const otherSpecialistUserId = await createConfirmedUser(otherSpecialistEmail, "other");
    setGlobalRole(otherSpecialistUserId, "specialist");
    createSpecialistProfile(otherSpecialistUserId);
    const editorId = await createConfirmedUser(editorEmail, "editor");
    setGlobalRole(editorId, "content_editor");

    // The content editor gains nothing from ETH-026.
    await logIn(page, editorEmail);
    await page.goto("/en/admin/specialists");
    await expect(page).toHaveURL(/auth-error\?reason=access-denied/);
    await logOut(page);

    // An unassigned specialist sees an empty workload and cannot reach the request.
    await logIn(page, specialistEmail);
    await page.goto("/en/specialist/support-requests");
    await expect(page.getByText("No assigned requests")).toBeVisible();
    await page.goto(`/en/specialist/support-requests/${requestId}`);
    await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();
    await logOut(page);

    await logIn(page, adminEmail);
    await page.goto("/en/admin/specialists");
    await expect(page.getByRole("heading", { name: "Specialist directory" })).toBeVisible();
    await expect(page.getByText("Synthetic worker").first()).toBeVisible();

    await page.goto(`/en/admin/support-requests/${requestId}`);
    await expect(page.getByText("No specialist assigned")).toBeVisible();
    await expect(page.getByText("No assignment activity yet.")).toBeVisible();
    // No message form, lifecycle, appointment, or notification controls exist here.
    await expect(page.getByLabel("Follow-up message")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close request" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByLabel("Assign specialist").selectOption(assignedSpecialistId);
    await page.getByRole("button", { name: "Assign specialist" }).click();
    await expect(page.getByRole("button", { name: "Revoke assignment" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Synthetic worker").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke assignment" })).toBeVisible();
    await expect(page.getByText("Assigned").first()).toBeVisible();
    await logOut(page);

    // The assigned specialist now sees and answers exactly this request.
    await logIn(page, specialistEmail);
    await page.goto("/en/specialist/support-requests");
    await expect(page.getByText(subject, { exact: true })).toBeVisible();
    await page.getByRole("link", { name: subject }).click();
    await page.waitForURL(/\/en\/specialist\/support-requests\/[0-9a-f-]{36}$/);
    await expect(
      page.getByText("A synthetic request that an administrator will assign to a specialist."),
    ).toBeVisible();
    await expect(
      page.getByText("Only the household may close or cancel this request.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Close request" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);

    const response = page.getByLabel("Specialist response");
    await response.focus();
    await page.keyboard.type("A synthetic specialist response for the household.");
    await page.getByRole("button", { name: "Add response" }).click();
    await expect(page.getByText("Response added.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("A synthetic specialist response for the household.")).toBeVisible();

    // Household areas stay data-empty for a specialist. The member shell is
    // reachable to any authenticated user, so the guarantee that matters is that
    // RLS yields no household content: no household name, request, or message.
    for (const path of ["/en/documents", "/en/dependents", "/en/roadmap", "/en/reminders"]) {
      await gotoStable(page, path);
      await expect(page.getByText(`Specialist household ${suffix}`)).toHaveCount(0);
      await expect(page.getByText(subject, { exact: true })).toHaveCount(0);
      await expect(page.getByText("A synthetic specialist response for the household.")).toHaveCount(0);
    }
    await logOut(page);

    // The household reads the specialist response and the safe specialist name.
    await logIn(page, ownerEmail);
    await page.goto(requestUrl);
    await expect(page.getByText("A synthetic specialist response for the household.")).toBeVisible();
    await expect(page.getByText("Specialist", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Synthetic worker").first()).toBeVisible();
    // Assignment history and controls stay administrator-only.
    await expect(page.getByText("Assignment history")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Assign specialist" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Revoke assignment" })).toHaveCount(0);
    await logOut(page);

    // Concurrency note: the stale-assignment-version conflict is verified in
    // pgTAP (a second administrator holding the pre-revocation version receives
    // the stale error) and in the Server Action unit tests (40001 maps to the
    // localized "updated elsewhere" message). Reproducing that two-administrator
    // race in the browser proved unreliable against the Next dev server, whose
    // second Server Action request was never dispatched, so it is deliberately
    // not asserted here rather than asserted weakly.
    await logIn(page, adminEmail);
    await page.goto(`/en/admin/support-requests/${requestId}`);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Revoke assignment" }).click();
    await expect(page.getByLabel("Assign specialist")).toBeVisible();
    await page.reload();
    await expect(page.getByText("No specialist assigned")).toBeVisible();
    await expect(page.getByText("Revoked").first()).toBeVisible();
    await expect(page.getByText("Revoked by an administrator")).toBeVisible();
    await logOut(page);

    // Revocation removes list and direct access immediately.
    await logIn(page, specialistEmail);
    await page.goto("/en/specialist/support-requests");
    await expect(page.getByText("No assigned requests")).toBeVisible();
    await page.goto(`/en/specialist/support-requests/${requestId}`);
    await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();
    await expect(page.getByLabel("Specialist response")).toHaveCount(0);
    await logOut(page);

    // Existing specialist messages remain visible to the household.
    await logIn(page, ownerEmail);
    await page.goto(requestUrl);
    await expect(page.getByText("A synthetic specialist response for the household.")).toBeVisible();
  });

  test("closing a request automatically revokes its assignment", async ({ page }) => {
    test.setTimeout(300_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerEmail = `spec-close-owner-${suffix}@example.test`;
    const adminEmail = `spec-close-admin-${suffix}@example.test`;
    const specialistEmail = `spec-close-worker-${suffix}@example.test`;
    const subject = `Auto revoke request ${suffix}`;

    await createConfirmedUser(ownerEmail, "owner");
    await logIn(page, ownerEmail);
    await completeOnboarding(page, `Auto revoke household ${suffix}`);
    const requestUrl = await createRequest(
      page,
      subject,
      "A synthetic request used to verify automatic revocation on close.",
    );
    const requestId = requestUrl.split("/").at(-1) ?? "";
    await logOut(page);

    const adminId = await createConfirmedUser(adminEmail, "admin");
    setGlobalRole(adminId, "administrator");
    const specialistUserId = await createConfirmedUser(specialistEmail, "worker");
    setGlobalRole(specialistUserId, "specialist");
    const assignedSpecialistId = createSpecialistProfile(specialistUserId);

    await logIn(page, adminEmail);
    await page.goto(`/en/admin/support-requests/${requestId}`);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByLabel("Assign specialist").selectOption(assignedSpecialistId);
    await page.getByRole("button", { name: "Assign specialist" }).click();
    await expect(page.getByRole("button", { name: "Revoke assignment" })).toBeVisible();
    await logOut(page);

    await logIn(page, specialistEmail);
    await page.goto("/en/specialist/support-requests");
    await expect(page.getByText(subject, { exact: true })).toBeVisible();
    await logOut(page);

    // The household closes the request; assignment ends atomically.
    await logIn(page, ownerEmail);
    await page.goto(requestUrl);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Close request" }).click();
    await expect(page.getByText("Closed", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("No specialist assigned")).toBeVisible();
    await logOut(page);

    await logIn(page, specialistEmail);
    await page.goto("/en/specialist/support-requests");
    await expect(page.getByText("No assigned requests")).toBeVisible();
    await page.goto(`/en/specialist/support-requests/${requestId}`);
    await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();
    await logOut(page);

    await logIn(page, adminEmail);
    await page.goto(`/en/admin/support-requests/${requestId}`);
    await expect(page.getByText("Automatically revoked when the request closed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Assign specialist" })).toHaveCount(0);
  });

  test("an active household_specialists row alone grants no access", async ({ page }) => {
    test.setTimeout(240_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerEmail = `spec-dormant-owner-${suffix}@example.test`;
    const specialistEmail = `spec-dormant-worker-${suffix}@example.test`;
    const subject = `Dormant assignment request ${suffix}`;

    await createConfirmedUser(ownerEmail, "owner");
    await logIn(page, ownerEmail);
    await completeOnboarding(page, `Dormant household ${suffix}`);
    const requestUrl = await createRequest(
      page,
      subject,
      "A synthetic request that no specialist is ever assigned to.",
    );
    const requestId = requestUrl.split("/").at(-1) ?? "";
    await logOut(page);

    const specialistUserId = await createConfirmedUser(specialistEmail, "worker");
    setGlobalRole(specialistUserId, "specialist");
    const specialistId = createSpecialistProfile(specialistUserId);
    const householdId = lookUpHouseholdId(`Dormant household ${suffix}`);
    // The dormant ETH-026-excluded household-wide record is deliberately active.
    runLocalSql(
      `insert into public.household_specialists (household_id, specialist_id, status) values ('${householdId}', '${specialistId}', 'active')`,
    );

    await logIn(page, specialistEmail);
    await page.goto("/en/specialist/support-requests");
    await expect(page.getByText("No assigned requests")).toBeVisible();
    await page.goto(`/en/specialist/support-requests/${requestId}`);
    await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();
    await page.goto(requestUrl);
    await expect(page.getByText("We could not find that page")).toBeVisible();
  });

  test("renders localized assignment surfaces and stays usable at narrow widths", async ({ page }) => {
    test.setTimeout(240_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const adminEmail = `spec-locale-admin-${suffix}@example.test`;
    const specialistEmail = `spec-locale-worker-${suffix}@example.test`;

    const adminId = await createConfirmedUser(adminEmail, "admin");
    setGlobalRole(adminId, "administrator");
    const specialistUserId = await createConfirmedUser(specialistEmail, "worker");
    setGlobalRole(specialistUserId, "specialist");
    createSpecialistProfile(specialistUserId);

    await logIn(page, adminEmail);
    await page.goto("/en/admin/specialists");
    await expect(page.getByRole("heading", { name: "Specialist directory" })).toBeVisible();
    await page.goto("/am/admin/specialists");
    await expect(page.getByRole("heading", { name: "የባለሙያዎች ማውጫ" })).toBeVisible();
    await page.goto("/es/admin/specialists");
    await expect(page.getByRole("heading", { name: "Directorio de especialistas" })).toBeVisible();

    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/en/admin/specialists");
    const adminFits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(adminFits).toBe(true);
    await logOut(page);

    await logIn(page, specialistEmail);
    await page.goto("/am/specialist/support-requests");
    await expect(page.getByRole("heading", { name: "የተመደቡ የድጋፍ ጥያቄዎች" })).toBeVisible();
    await page.goto("/es/specialist/support-requests");
    await expect(page.getByRole("heading", { name: "Solicitudes de apoyo asignadas" })).toBeVisible();
    await page.goto("/en/specialist/support-requests");
    await expect(page.getByRole("heading", { name: "Assigned support requests" })).toBeVisible();
    const specialistFits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(specialistFits).toBe(true);
  });
});
