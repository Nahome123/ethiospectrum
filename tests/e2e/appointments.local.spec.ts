import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const localSupabaseUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;
const isDedicatedLocalRun =
  process.env.E2E_DOCUMENTS_LOCAL_CONFIG === "1" &&
  process.env.E2E_LOCAL_SUPABASE === "1" &&
  localSupabaseUrl.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

const password = "Local-appointment-test-password-123!";
const uuidShape = /^[0-9a-f-]{36}$/i;
const fixtureNameShape = /^[A-Za-z0-9 -]+$/;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("The local appointment test configuration is incomplete.");
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
  if (!uuidShape.test(value)) throw new Error(`The local appointment fixture has an invalid ${label}.`);
  return value;
}

function lookUpHouseholdId(name: string): string {
  if (!fixtureNameShape.test(name)) throw new Error("The local appointment fixture name is invalid.");
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
  if (error || !data.user) throw new Error("The synthetic local appointment user was not created.");
  return requireUuid(data.user.id, "user id");
}

function setGlobalRole(userId: string, role: "administrator" | "specialist" | "content_editor") {
  runLocalSql(
    `update public.user_roles set role = '${role}' where user_id = '${requireUuid(userId, "user id")}'`,
  );
}

function createSpecialistProfile(userId: string) {
  runLocalSql(
    `insert into public.specialists (user_id, availability_status, languages, specialties) values ('${requireUuid(userId, "user id")}', 'available', array['English'], array['Education'])`,
  );
  return requireUuid(
    runLocalSql(`select id from public.specialists where user_id = '${userId}'`),
    "specialist id",
  );
}

function addSyntheticMembership(
  householdId: string,
  userId: string,
  permission: "owner" | "administrator" | "member" | "viewer",
) {
  runLocalSql(
    `insert into public.household_members (household_id, user_id, permission, status, joined_at) values ('${requireUuid(householdId, "household id")}', '${requireUuid(userId, "user id")}', '${permission}', 'active', now())`,
  );
}

/** A date safely inside the 24-hour lead time and 90-day horizon. */
function futureDate(daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * The Next dev server occasionally answers with its root not-found shell while a
 * route compiles. Retry that specific case once.
 */
async function gotoStable(page: Page, path: string) {
  await page.goto(path);
  if (
    await page
      .getByText("This page could not be found.")
      .isVisible()
      .catch(() => false)
  ) {
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

async function proposeAppointment(
  page: Page,
  requestId: string,
  {
    daysAhead = 5,
    time = "14:30",
    timezone = "UTC",
    duration = "45",
    modality = "video",
    meetingUrl = "https://meet.example.test/synthetic",
  }: Partial<{
    daysAhead: number;
    time: string;
    timezone: string;
    duration: string;
    modality: string;
    meetingUrl: string;
  }> = {},
) {
  await gotoStable(page, `/en/specialist/support-requests/${requestId}`);
  await page.getByLabel("Date *").fill(futureDate(daysAhead));
  await page.getByLabel("Time *").fill(time);
  await page.getByLabel("Timezone *").fill(timezone);
  await page.getByLabel("Duration *").selectOption(duration);
  await page.getByLabel("Meeting method *").selectOption(modality);
  if (modality === "video") {
    await page.getByLabel("Meeting link *").fill(meetingUrl);
  }
  await page.getByRole("button", { name: "Propose appointment" }).click();
}

test.describe("appointment scheduling (local Supabase only)", () => {
  test.skip(!isDedicatedLocalRun, "Appointment coverage requires the dedicated local configuration.");

  test("denies logged-out and unassigned access to appointment surfaces", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/en/specialist/support-requests");
    await expect(page).toHaveURL(/\/en\/login/);

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerEmail = `appt-denial-owner-${suffix}@example.test`;
    const specialistEmail = `appt-denial-spec-${suffix}@example.test`;
    await createConfirmedUser(ownerEmail, "owner");
    await logIn(page, ownerEmail);
    await completeOnboarding(page, `Denial household ${suffix}`);
    const requestUrl = await createRequest(
      page,
      `Denial request ${suffix}`,
      "A synthetic request with no specialist assigned yet.",
    );
    const requestId = requestUrl.split("/").at(-1) ?? "";
    // With no assignment there is no appointment surface at all.
    await expect(page.getByText("No appointment proposed yet.")).toHaveCount(0);
    await logOut(page);

    const specialistUserId = await createConfirmedUser(specialistEmail, "specialist");
    setGlobalRole(specialistUserId, "specialist");
    createSpecialistProfile(specialistUserId);
    await logIn(page, specialistEmail);
    await gotoStable(page, `/en/specialist/support-requests/${requestId}`);
    await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Propose appointment" })).toHaveCount(0);
  });

  test("specialist proposes, household consents, and the appointment schedules", async ({ page }) => {
    test.setTimeout(420_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerEmail = `appt-owner-${suffix}@example.test`;
    const viewerEmail = `appt-viewer-${suffix}@example.test`;
    const adminEmail = `appt-admin-${suffix}@example.test`;
    const specialistEmail = `appt-spec-${suffix}@example.test`;

    await createConfirmedUser(ownerEmail, "owner");
    await logIn(page, ownerEmail);
    await completeOnboarding(page, `Appointment household ${suffix}`);
    const requestUrl = await createRequest(
      page,
      `Appointment request ${suffix}`,
      "A synthetic request that a specialist will schedule an appointment for.",
    );
    const requestId = requestUrl.split("/").at(-1) ?? "";
    const householdId = lookUpHouseholdId(`Appointment household ${suffix}`);
    await logOut(page);

    const viewerId = await createConfirmedUser(viewerEmail, "viewer");
    addSyntheticMembership(householdId, viewerId, "viewer");
    const adminId = await createConfirmedUser(adminEmail, "admin");
    setGlobalRole(adminId, "administrator");
    const specialistUserId = await createConfirmedUser(specialistEmail, "specialist");
    setGlobalRole(specialistUserId, "specialist");
    const specialistId = createSpecialistProfile(specialistUserId);

    await logIn(page, adminEmail);
    await gotoStable(page, `/en/admin/support-requests/${requestId}`);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByLabel("Assign specialist").selectOption(specialistId);
    await page.getByRole("button", { name: "Assign specialist" }).click();
    await expect(page.getByRole("button", { name: "Revoke assignment" })).toBeVisible();
    // Administrators observe appointments but never schedule them.
    await expect(page.getByText("No appointment proposed yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Propose appointment" })).toHaveCount(0);
    await logOut(page);

    // Invalid proposals are rejected before anything is scheduled.
    await logIn(page, specialistEmail);
    await proposeAppointment(page, requestId, { modality: "video", meetingUrl: "http://insecure.test/x" });
    await expect(page.getByRole("button", { name: "Propose appointment" })).toBeVisible();
    await proposeAppointment(page, requestId, { daysAhead: 0, time: "01:00" });
    await expect(page.getByRole("button", { name: "Propose appointment" })).toBeVisible();

    await proposeAppointment(page, requestId, { daysAhead: 6, timezone: "America/New_York" });
    await expect(page.getByText("Proposed", { exact: true })).toBeVisible();
    await expect(page.getByText("America/New_York")).toBeVisible();
    await expect(page.getByText("45 minutes")).toBeVisible();
    // The link is withheld from the specialist view until the household accepts.
    await expect(page.getByRole("button", { name: "Mark completed" })).toHaveCount(0);
    await logOut(page);

    // A viewer sees the proposal but cannot consent.
    await logIn(page, viewerEmail);
    await gotoStable(page, requestUrl);
    await expect(page.getByText("Proposed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept appointment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Decline appointment" })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await logOut(page);

    // The household consents through the explicit, unchecked checkbox.
    await logIn(page, ownerEmail);
    await gotoStable(page, requestUrl);
    await expect(
      page.getByText("This appointment is for non-emergency support", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("may require the specialist to send a new proposal", { exact: false }),
    ).toBeVisible();
    const consent = page.getByRole("checkbox");
    await expect(consent).not.toBeChecked();
    await page.getByRole("button", { name: "Accept appointment" }).click();
    await expect(page.getByText("Proposed", { exact: true })).toBeVisible();

    await consent.check();
    await page.getByRole("button", { name: "Accept appointment" }).click();
    await expect(page.getByText("Scheduled", { exact: true })).toBeVisible();
    await expect(page.getByText("Accepted by the household")).toBeVisible();
    await expect(page.getByRole("link", { name: /meet\.example\.test/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request another time" })).toBeVisible();
    await logOut(page);

    // The administrator sees the scheduled appointment and its history, read-only.
    await logIn(page, adminEmail);
    await gotoStable(page, `/en/admin/support-requests/${requestId}`);
    await expect(page.getByText("Scheduled", { exact: true })).toBeVisible();
    await expect(page.getByText("Appointment history")).toBeVisible();
    await expect(page.getByText("Administrators can review appointments", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept appointment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel appointment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark completed" })).toHaveCount(0);
  });

  test("closing the request automatically cancels a live appointment", async ({ page }) => {
    test.setTimeout(420_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerEmail = `appt-close-owner-${suffix}@example.test`;
    const adminEmail = `appt-close-admin-${suffix}@example.test`;
    const specialistEmail = `appt-close-spec-${suffix}@example.test`;

    await createConfirmedUser(ownerEmail, "owner");
    await logIn(page, ownerEmail);
    await completeOnboarding(page, `Close household ${suffix}`);
    const requestUrl = await createRequest(
      page,
      `Close request ${suffix}`,
      "A synthetic request used to verify automatic appointment cancellation.",
    );
    const requestId = requestUrl.split("/").at(-1) ?? "";
    await logOut(page);

    const adminId = await createConfirmedUser(adminEmail, "admin");
    setGlobalRole(adminId, "administrator");
    const specialistUserId = await createConfirmedUser(specialistEmail, "specialist");
    setGlobalRole(specialistUserId, "specialist");
    const specialistId = createSpecialistProfile(specialistUserId);

    await logIn(page, adminEmail);
    await gotoStable(page, `/en/admin/support-requests/${requestId}`);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByLabel("Assign specialist").selectOption(specialistId);
    await page.getByRole("button", { name: "Assign specialist" }).click();
    await expect(page.getByRole("button", { name: "Revoke assignment" })).toBeVisible();
    await logOut(page);

    await logIn(page, specialistEmail);
    await proposeAppointment(page, requestId, { daysAhead: 7, modality: "phone" });
    await expect(page.getByText("Proposed", { exact: true })).toBeVisible();
    await expect(page.getByText("Phone", { exact: true })).toBeVisible();
    await logOut(page);

    // The household closes the request; the appointment ends with it.
    await logIn(page, ownerEmail);
    await gotoStable(page, requestUrl);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Close request" }).click();
    await expect(page.getByText("Closed", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    await logOut(page);

    await logIn(page, specialistEmail);
    await gotoStable(page, `/en/specialist/support-requests/${requestId}`);
    await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();
    await logOut(page);

    await logIn(page, adminEmail);
    await gotoStable(page, `/en/admin/support-requests/${requestId}`);
    // The controlled reason stays visible after cancellation in both the appointment
    // summary and the immutable history that only administrators see.
    await expect(
      page.getByRole("definition").filter({ hasText: "Cancelled when the support request closed" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Appointment history").getByText("Cancelled when the support request closed"),
    ).toBeVisible();
  });

  test("renders localized appointment surfaces and stays usable at narrow widths", async ({ page }) => {
    test.setTimeout(300_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerEmail = `appt-locale-owner-${suffix}@example.test`;
    const adminEmail = `appt-locale-admin-${suffix}@example.test`;
    const specialistEmail = `appt-locale-spec-${suffix}@example.test`;

    await createConfirmedUser(ownerEmail, "owner");
    await logIn(page, ownerEmail);
    await completeOnboarding(page, `Locale household ${suffix}`);
    const requestUrl = await createRequest(
      page,
      `Locale request ${suffix}`,
      "A synthetic request used to verify localized appointment rendering.",
    );
    const requestId = requestUrl.split("/").at(-1) ?? "";
    await logOut(page);

    const adminId = await createConfirmedUser(adminEmail, "admin");
    setGlobalRole(adminId, "administrator");
    const specialistUserId = await createConfirmedUser(specialistEmail, "specialist");
    setGlobalRole(specialistUserId, "specialist");
    const specialistId = createSpecialistProfile(specialistUserId);

    await logIn(page, adminEmail);
    await gotoStable(page, `/en/admin/support-requests/${requestId}`);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByLabel("Assign specialist").selectOption(specialistId);
    await page.getByRole("button", { name: "Assign specialist" }).click();
    await expect(page.getByRole("button", { name: "Revoke assignment" })).toBeVisible();
    await logOut(page);

    await logIn(page, specialistEmail);
    await proposeAppointment(page, requestId, { daysAhead: 8, modality: "phone" });
    await expect(page.getByText("Proposed", { exact: true })).toBeVisible();
    await logOut(page);

    await logIn(page, ownerEmail);
    await gotoStable(page, `/am/support/${requestId}`);
    await expect(page.getByRole("heading", { name: "ቀጠሮ", exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await gotoStable(page, `/es/support/${requestId}`);
    await expect(page.getByRole("heading", { name: "Cita", exact: true })).toBeVisible();
    await expect(page.getByText("no garantiza servicios", { exact: false })).toBeVisible();
    await gotoStable(page, `/en/support/${requestId}`);
    await expect(page.getByRole("heading", { name: "Appointment", exact: true })).toBeVisible();

    await page.setViewportSize({ width: 360, height: 740 });
    await page.reload();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(fits).toBe(true);
  });
});
