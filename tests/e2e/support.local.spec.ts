import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const localSupabaseUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;
const isDedicatedLocalRun =
  process.env.E2E_DOCUMENTS_LOCAL_CONFIG === "1" &&
  process.env.E2E_LOCAL_SUPABASE === "1" &&
  localSupabaseUrl.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

const password = "Local-support-test-password-123!";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("The local support test configuration is incomplete.");
  return createClient(url, secret);
}

const uuidShape = /^[0-9a-f-]{36}$/i;
const fixtureNameShape = /^[A-Za-z0-9 -]+$/;

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
  if (!uuidShape.test(value)) throw new Error(`The local support fixture has an invalid ${label}.`);
  return value;
}

function lookUpHouseholdId(name: string): string {
  if (!fixtureNameShape.test(name)) throw new Error("The local support fixture name is invalid.");
  return requireUuid(runLocalSql(`select id from public.households where name = '${name}'`), "household id");
}

function addSyntheticMembership(
  householdId: string,
  userId: string,
  permission: "administrator" | "member" | "viewer" | "owner",
): void {
  requireUuid(householdId, "household id");
  requireUuid(userId, "user id");
  runLocalSql(
    `insert into public.household_members (household_id, user_id, permission, status, joined_at) values ('${householdId}', '${userId}', '${permission}', 'active', now())`,
  );
}

async function createConfirmedUser(email: string) {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // Onboarding requires a profile first name from Auth metadata.
    user_metadata: { first_name: "Synthetic", last_name: "Support", preferred_locale: "en" },
  });
  if (error || !data.user) throw new Error("The synthetic local support user was not created.");
  return data.user.id;
}

async function logIn(page: Page, email: string) {
  await page.goto("/en/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(/\/en\/(?:dashboard|onboarding)$/),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
}

async function logOut(page: Page) {
  await Promise.all([page.waitForURL(/\/en\/login$/), page.getByRole("button", { name: "Log out" }).click()]);
}

async function completeOnboarding(page: Page, householdName: string) {
  await page.goto("/en/onboarding");
  await page.getByLabel("Household name").fill(householdName);
  await page.getByRole("checkbox").check();
  await Promise.all([
    page.waitForURL(/\/en\/dashboard$/),
    page.getByRole("button", { name: "Create household" }).click(),
  ]);
}

async function createRequest(page: Page, subject: string, description: string) {
  await page.goto("/en/support/new");
  await page.getByLabel("Subject *").fill(subject);
  await page.getByLabel("What do you need help with? *").fill(description);
  await page.getByRole("checkbox").check();
  await Promise.all([
    page.waitForURL(/\/en\/support\/[0-9a-f-]{36}$/),
    page.getByRole("button", { name: "Submit request" }).click(),
  ]);
}

test.describe("specialist support requests (local Supabase only)", () => {
  test.skip(!isDedicatedLocalRun, "Support mutation coverage requires the dedicated local configuration.");

  test("denies logged-out access to member and administrator support routes", async ({ page }) => {
    await page.goto("/en/support");
    await expect(page).toHaveURL(/\/en\/login/);
    await page.goto("/en/admin/support-requests");
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("owner creates, follows up on, and closes a request with clear expectations", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const email = `support-owner-${suffix}@example.test`;
    const subject = `School evaluation help ${suffix}`;
    await createConfirmedUser(email);
    await logIn(page, email);
    await completeOnboarding(page, `Support household ${suffix}`);

    await page.goto("/en/support");
    await expect(page.getByRole("heading", { name: "Support requests", exact: true })).toBeVisible();
    await expect(page.getByText("No support requests yet")).toBeVisible();
    await expect(page.getByText("not an emergency service").first()).toBeVisible();
    await page.getByRole("link", { name: "Ask for support" }).click();
    await page.waitForURL(/\/en\/support\/new$/);

    // The disclaimer and household visibility notice sit outside any tooltip.
    await expect(
      page.getByText("This request is for non-urgent support navigation.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "All active members of your household can view this request and its follow-up messages.",
      ),
    ).toBeVisible();
    const acknowledgment = page.getByRole("checkbox");
    await expect(acknowledgment).not.toBeChecked();

    // No ETH-026, attachment, appointment, dependent, or document controls exist.
    // Only the category and preferred-language selects render inside the page body.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.locator("main select")).toHaveCount(2);
    await expect(page.getByText("Specialist", { exact: false })).toHaveCount(0);

    await page.getByLabel("Subject *").fill("Hey");
    await page
      .getByLabel("What do you need help with? *")
      .fill("We need help preparing for an upcoming school evaluation meeting.");
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page.getByText("Enter a subject between 5 and 120 characters.")).toBeVisible();
    await expect(
      page.getByText("Please confirm the support request expectations to continue."),
    ).toBeVisible();

    await page.getByLabel("Subject *").fill(subject);
    await page.getByLabel("Category").selectOption("education");
    await page.getByLabel("Preferred language").selectOption("en");
    await acknowledgment.check();
    await Promise.all([
      page.waitForURL(/\/en\/support\/[0-9a-f-]{36}$/),
      page.getByRole("button", { name: "Submit request" }).click(),
    ]);
    const detailUrl = page.url();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await expect(page.getByText("Open", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "All active members of your household can view this request and its follow-up messages.",
      ),
    ).toBeVisible();

    await page.goto("/en/support");
    await expect(page.getByText(subject, { exact: true })).toBeVisible();
    await page.goto(detailUrl);
    await page.reload();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();

    const followUp = page.getByLabel("Follow-up message");
    await followUp.focus();
    await page.keyboard.type("Here is an additional detail about the meeting date.");
    await page.getByRole("button", { name: "Add follow-up" }).click();
    await expect(page.getByText("Follow-up message added.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Here is an additional detail about the meeting date.")).toBeVisible();

    // A concurrent tab closes the request first; the stale tab gets a safe conflict.
    const secondTab = await context.newPage();
    await secondTab.goto(detailUrl);
    secondTab.once("dialog", (dialog) => void dialog.accept());
    await secondTab.getByRole("button", { name: "Close request" }).click();
    await expect(secondTab.getByText("Closed", { exact: true })).toBeVisible();
    await secondTab.close();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Close request" }).click();
    await expect(page.getByText("This support request is already closed or cancelled.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Closed", { exact: true })).toBeVisible();
    await expect(page.getByText("This request is closed.", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Follow-up message")).toHaveCount(0);
  });

  test("member, viewer, and cross-household roles follow the permission matrix", async ({ page }) => {
    test.setTimeout(240_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerEmail = `support-matrix-owner-${suffix}@example.test`;
    const memberEmail = `support-matrix-member-${suffix}@example.test`;
    const viewerEmail = `support-matrix-viewer-${suffix}@example.test`;
    const outsiderEmail = `support-matrix-outsider-${suffix}@example.test`;
    const ownerSubject = `Owner request ${suffix}`;
    const memberSubject = `Member request ${suffix}`;

    await createConfirmedUser(ownerEmail);
    await logIn(page, ownerEmail);
    await completeOnboarding(page, `Matrix household ${suffix}`);
    await createRequest(page, ownerSubject, "The owner is asking for help understanding a benefits letter.");
    const ownerRequestUrl = page.url();

    const householdId = lookUpHouseholdId(`Matrix household ${suffix}`);
    const memberId = requireUuid(await createConfirmedUser(memberEmail), "member id");
    const viewerId = requireUuid(await createConfirmedUser(viewerEmail), "viewer id");
    const outsiderId = requireUuid(await createConfirmedUser(outsiderEmail), "outsider id");
    addSyntheticMembership(householdId, memberId, "member");
    addSyntheticMembership(householdId, viewerId, "viewer");
    runLocalSql(
      `insert into public.households (name, primary_owner_id, created_by) values ('Outside household ${suffix}', '${outsiderId}', '${outsiderId}')`,
    );
    addSyntheticMembership(lookUpHouseholdId(`Outside household ${suffix}`), outsiderId, "owner");
    await logOut(page);

    await logIn(page, memberEmail);
    await page.goto(ownerRequestUrl);
    await expect(page.getByRole("heading", { name: ownerSubject })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close request" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
    await page.getByLabel("Follow-up message").fill("A member can add household context here.");
    await page.getByRole("button", { name: "Add follow-up" }).click();
    await expect(page.getByText("Follow-up message added.")).toBeVisible();

    await createRequest(
      page,
      memberSubject,
      "The member submitted this request by mistake and will cancel it.",
    );
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Cancel request" }).click();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Follow-up message")).toHaveCount(0);
    await logOut(page);

    await logIn(page, viewerEmail);
    await page.goto("/en/support");
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ask for support" })).toHaveCount(0);
    await expect(page.getByText(ownerSubject, { exact: true })).toBeVisible();
    await page.goto(ownerRequestUrl);
    await expect(page.getByRole("heading", { name: ownerSubject })).toBeVisible();
    await expect(page.getByText("A member can add household context here.")).toBeVisible();
    await expect(page.getByLabel("Follow-up message")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close request" })).toHaveCount(0);
    await page.goto("/en/support/new");
    await expect(page.getByRole("button", { name: "Submit request" })).toHaveCount(0);
    await logOut(page);

    await logIn(page, outsiderEmail);
    await page.goto("/en/support");
    await expect(page.getByText("No support requests yet")).toBeVisible();
    await page.goto(ownerRequestUrl);
    await expect(page.getByText("We could not find that page")).toBeVisible();
  });

  test("platform administrators get read-only triage while specialists stay denied", async ({ page }) => {
    test.setTimeout(240_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerEmail = `support-triage-owner-${suffix}@example.test`;
    const platformAdminEmail = `support-triage-admin-${suffix}@example.test`;
    const specialistEmail = `support-triage-specialist-${suffix}@example.test`;
    const subject = `Triage request ${suffix}`;

    await createConfirmedUser(ownerEmail);
    await logIn(page, ownerEmail);
    await completeOnboarding(page, `Triage household ${suffix}`);
    await createRequest(page, subject, "This request exercises the administrator triage queue.");
    const requestUrl = page.url();
    await logOut(page);

    const platformAdminId = requireUuid(await createConfirmedUser(platformAdminEmail), "admin id");
    runLocalSql(`update public.user_roles set role = 'administrator' where user_id = '${platformAdminId}'`);

    const specialistId = requireUuid(await createConfirmedUser(specialistEmail), "specialist id");
    runLocalSql(`update public.user_roles set role = 'specialist' where user_id = '${specialistId}'`);
    runLocalSql(`insert into public.specialists (user_id) values ('${specialistId}')`);
    const specialistRowId = requireUuid(
      runLocalSql(`select id from public.specialists where user_id = '${specialistId}'`),
      "specialist row id",
    );
    const triageHouseholdId = lookUpHouseholdId(`Triage household ${suffix}`);
    runLocalSql(
      `insert into public.household_specialists (household_id, specialist_id, status) values ('${triageHouseholdId}', '${specialistRowId}', 'active')`,
    );

    await logIn(page, platformAdminEmail);
    await page.goto("/en/admin/support-requests");
    await expect(page.getByRole("heading", { name: "Support request triage" })).toBeVisible();
    await expect(page.getByText("Read-only triage")).toBeVisible();
    await expect(
      page.getByText("Specialist assignment and specialist responses are not available yet."),
    ).toBeVisible();
    await expect(page.getByText(subject, { exact: true })).toBeVisible();
    await expect(page.getByText(`Triage household ${suffix}`)).toBeVisible();
    await page.getByRole("link", { name: subject }).click();
    await page.waitForURL(/\/en\/admin\/support-requests\/[0-9a-f-]{36}$/);
    await expect(page.getByText("This request exercises the administrator triage queue.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Close request" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
    await expect(page.getByLabel("Follow-up message")).toHaveCount(0);
    await expect(page.locator("main select")).toHaveCount(0);
    await page.goto("/en/admin/support-requests");
    await expect(page.locator("main select")).toHaveCount(2);
    await logOut(page);

    await logIn(page, specialistEmail);
    await page.goto("/en/support");
    await expect(
      page.getByText("Support requests are available after you set up or join a household."),
    ).toBeVisible();
    await page.goto(requestUrl);
    await expect(page.getByText("We could not find that page")).toBeVisible();
    await page.goto("/en/admin/support-requests");
    await expect(page).toHaveURL(/auth-error\?reason=access-denied/);
  });

  test("renders localized support flows and stays usable at narrow widths", async ({ page }) => {
    test.setTimeout(240_000);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const email = `support-locale-owner-${suffix}@example.test`;
    await createConfirmedUser(email);
    await logIn(page, email);
    await completeOnboarding(page, `Locale household ${suffix}`);

    await page.goto("/am/support");
    await expect(page.getByRole("heading", { name: "የድጋፍ ጥያቄዎች", exact: true })).toBeVisible();
    await page.goto("/am/support/new");
    await expect(page.getByText("የአደጋ ጊዜ አገልግሎት አይደለም", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("checkbox")).not.toBeChecked();

    await page.goto("/es/support");
    await expect(page.getByRole("heading", { name: "Solicitudes de apoyo", exact: true })).toBeVisible();
    await page.goto("/es/support/new");
    await expect(page.getByText("no es un servicio de emergencia", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("checkbox")).not.toBeChecked();

    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/en/support");
    const fitsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(fitsViewport).toBe(true);
  });
});
