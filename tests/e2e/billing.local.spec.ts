import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const localSupabaseUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;
const isDedicatedLocalRun =
  process.env.E2E_DOCUMENTS_LOCAL_CONFIG === "1" &&
  process.env.E2E_LOCAL_SUPABASE === "1" &&
  localSupabaseUrl.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const password = "Local-billing-test-password-123!";
const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];
const createdEventIds: string[] = [];
const messages = Object.fromEntries(
  (["en", "am", "es"] as const).map((locale) => [
    locale,
    JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as {
      billing: { title: string; currentPlan: string; secureTitle: string };
    },
  ]),
);

function localAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret || !localSupabaseUrl.test(url)) {
    throw new Error("The dedicated local billing test configuration is incomplete.");
  }
  return createClient(url, secret);
}

function runLocalSql(sql: string, variables: Record<string, string> = {}) {
  const variableArguments = Object.entries(variables).flatMap(([name, value]) => ["-v", `${name}=${value}`]);
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_ethiospectrum-web",
      "psql",
      "--set=ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      ...variableArguments,
    ],
    { encoding: "utf8", input: `${sql};\n`, stdio: ["pipe", "pipe", "pipe"] },
  );
}

async function createActor(
  role: "member" | "administrator" | "specialist" | "content_editor",
  label: string,
) {
  const email = `billing-${label}-${Date.now()}-${randomUUID()}@example.test`;
  const result = await localAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Synthetic", last_name: label, preferred_locale: "en" },
  });
  if (result.error || !result.data.user) throw new Error(`Could not create synthetic ${label}.`);
  createdUserIds.push(result.data.user.id);
  runLocalSql("update public.user_roles set role=:'role' where user_id=:'user_id'", {
    role,
    user_id: result.data.user.id,
  });
  return { id: result.data.user.id, email };
}

function createHousehold(ownerId: string, name: string) {
  const householdId = randomUUID();
  runLocalSql(
    "insert into public.households(id,primary_owner_id,created_by,name) values (:'id',:'owner_id',:'owner_id',:'name')",
    { id: householdId, owner_id: ownerId, name },
  );
  runLocalSql(
    "insert into public.household_members(household_id,user_id,permission,status,joined_at) values (:'household_id',:'user_id','owner','active',now())",
    { household_id: householdId, user_id: ownerId },
  );
  createdHouseholdIds.push(householdId);
  return householdId;
}

function addHouseholdRole(
  householdId: string,
  userId: string,
  permission: "administrator" | "member" | "viewer",
) {
  runLocalSql(
    "insert into public.household_members(household_id,user_id,permission,status,joined_at) values (:'household_id',:'user_id',:'permission','active',now())",
    { household_id: householdId, user_id: userId, permission },
  );
}

function stripeIds(householdId: string) {
  const suffix = householdId.replaceAll("-", "");
  return {
    customer: `cus_${suffix}`,
    subscription: `sub_${suffix}`,
    price: `price_${suffix}`,
    invoice: `in_${suffix}`,
  };
}

function setSubscription(
  householdId: string,
  status: "active" | "past_due" | "canceled",
  {
    cancelAtPeriodEnd = false,
    interval = "month",
  }: { cancelAtPeriodEnd?: boolean; interval?: "month" | "year" } = {},
) {
  const ids = stripeIds(householdId);
  runLocalSql(
    `insert into public.billing_customers(household_id,stripe_customer_id)
       values (:'household_id',:'customer') on conflict (household_id) do nothing;
     insert into public.billing_subscriptions(
       household_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,plan_key,
       billing_interval,stripe_status,entitlement_status,current_period_start,current_period_end,
       cancel_at_period_end,cancelled_at,provider_updated_at
     ) values (
       :'household_id',:'customer',:'subscription',:'price','family_plus',:'interval',:'status',
       :'entitlement',now() - interval '2 days',now() + interval '28 days',:'cancel_at_period_end'::boolean,
       case when :'status'='canceled' then now() else null end,now()
     ) on conflict (household_id) do update set
       stripe_status=excluded.stripe_status,entitlement_status=excluded.entitlement_status,
       cancel_at_period_end=excluded.cancel_at_period_end,cancelled_at=excluded.cancelled_at,
       provider_updated_at=excluded.provider_updated_at,version=public.billing_subscriptions.version+1`,
    {
      household_id: householdId,
      customer: ids.customer,
      subscription: ids.subscription,
      price: ids.price,
      interval,
      status,
      entitlement: status === "active" ? "active" : "inactive",
      cancel_at_period_end: String(cancelAtPeriodEnd),
    },
  );
  return ids;
}

function addPaidInvoice(householdId: string) {
  const ids = stripeIds(householdId);
  runLocalSql(
    `insert into public.billing_invoices(
       household_id,stripe_invoice_id,stripe_subscription_id,amount_due,amount_paid,currency,status,
       invoice_number,hosted_invoice_url,period_start,period_end,provider_created_at,provider_updated_at
     ) values (
       :'household_id',:'invoice',:'subscription',2900,2900,'usd','paid','TEST-028',
       'https://invoice.stripe.test/eth-028',now() - interval '1 month',now(),now(),now()
     )`,
    { household_id: householdId, invoice: ids.invoice, subscription: ids.subscription },
  );
}

function addFailedWebhookEvent() {
  const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
  runLocalSql(
    `insert into public.stripe_webhook_events(
       stripe_event_id,event_type,provider_created_at,processing_status,attempt_count,last_error_code
     ) values (:'event_id','invoice.payment_failed',now(),'failed',2,'provider_fetch_failed')`,
    { event_id: eventId },
  );
  createdEventIds.push(eventId);
}

async function login(page: Page, email: string, locale = "en") {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(locale === "en" ? "Email address" : /@/).fill(email);
  await page
    .getByLabel(locale === "en" ? "Password" : /./)
    .last()
    .fill(password);
  await Promise.all([
    page.waitForURL(new RegExp(`/${locale}/(?:dashboard|onboarding|admin)$`)),
    page.getByRole("button", { name: locale === "en" ? "Log in" : /.+/ }).click(),
  ]);
}

async function openAuthenticatedPage(browser: Browser, email: string, path: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email);
  await page.goto(path);
  return { context, page };
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? "")),
  ).toEqual([]);
}

test.describe("Stripe subscriptions (local Supabase and safe provider fixtures only)", () => {
  test.skip(!isDedicatedLocalRun, "Billing coverage requires the dedicated local configuration.");
  test.setTimeout(300_000);

  test.afterEach(async () => {
    for (const eventId of createdEventIds.splice(0)) {
      runLocalSql("delete from public.stripe_webhook_events where stripe_event_id=:'id'", { id: eventId });
    }
    for (const householdId of createdHouseholdIds.splice(0)) {
      runLocalSql("delete from public.households where id=:'id'", { id: householdId });
    }
    const admin = localAdmin();
    for (const userId of createdUserIds.splice(0)) await admin.auth.admin.deleteUser(userId);
  });

  test("denies logged-out, specialist, and content-editor billing access", async ({ browser, page }) => {
    await page.goto("/en/billing");
    await expect(page).toHaveURL(/\/en\/login\?next=/);

    for (const role of ["specialist", "content_editor"] as const) {
      const actor = await createActor(role, role);
      const session = await openAuthenticatedPage(browser, actor.email, "/en/billing");
      await expect(session.page).toHaveURL(/\/en\/auth-error\?reason=access-denied$/);
      await session.context.close();
    }
  });

  test("renders the owner lifecycle without trusting redirects or browser price IDs", async ({ page }) => {
    const owner = await createActor("member", "owner");
    const householdName = `Billing household ${randomUUID().slice(0, 8)}`;
    const householdId = createHousehold(owner.id, householdName);
    await login(page, owner.email);
    await page.goto("/en/billing?checkout=success");

    await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
    await expect(page.getByText(householdName)).toBeVisible();
    await expect(page.getByText("Free", { exact: true })).toBeVisible();
    await expect(page.getByText("Subscription inactive", { exact: true })).toBeVisible();
    await expect(page.getByText("Confirming subscription", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Subscribe with Stripe" })).toHaveCount(2);
    await expect(
      page.locator('input[name="priceId"], input[name="householdId"], input[name="customerId"]'),
    ).toHaveCount(0);
    const intervalInputs = page.locator('input[name="billingInterval"]');
    await expect(intervalInputs).toHaveCount(2);
    expect(
      await intervalInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    ).toEqual(["month", "year"]);

    // Exercise keyboard-submit semantics without contacting Stripe or using any credentials.
    const planForms = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Subscribe with Stripe" }) });
    for (const form of await planForms.all()) {
      await form.evaluate((element) =>
        element.addEventListener("submit", (event) => event.preventDefault(), true),
      );
      const button = form.getByRole("button", { name: "Subscribe with Stripe" });
      await button.focus();
      await expect(button).toBeFocused();
      await button.press("Enter");
    }
    await expectNoSeriousAccessibilityViolations(page);

    setSubscription(householdId, "active", { cancelAtPeriodEnd: true });
    addPaidInvoice(householdId);
    await page.goto("/en/billing");
    await expect(page.getByText("Family Plus", { exact: true })).toBeVisible();
    await expect(page.getByText("Subscription active", { exact: true })).toBeVisible();
    await expect(page.getByText("Monthly", { exact: true })).toBeVisible();
    await expect(page.getByText("Cancellation scheduled", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Stripe Customer Portal" })).toBeVisible();
    await expect(page.getByText("Invoice TEST-028", { exact: true })).toBeVisible();
    const receipt = page.getByRole("link", { name: /Open Stripe receipt/ });
    await expect(receipt).toHaveAttribute("href", "https://invoice.stripe.test/eth-028");
    await expect(receipt).toHaveAttribute("target", "_blank");
    await expect(page.getByText(/email|SMS|appointment charge/i)).toHaveCount(0);

    const portalForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Open Stripe Customer Portal" }) });
    await portalForm.evaluate((element) =>
      element.addEventListener("submit", (event) => event.preventDefault(), true),
    );
    await page.getByRole("button", { name: "Open Stripe Customer Portal" }).click();

    setSubscription(householdId, "past_due");
    await page.reload();
    await expect(page.getByText("Subscription inactive", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Subscribe with Stripe" })).toHaveCount(0);

    setSubscription(householdId, "canceled");
    await page.reload();
    await expect(page.getByText("Free", { exact: true })).toBeVisible();
    await expect(page.getByText("Subscription inactive", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Subscribe with Stripe" })).toHaveCount(2);

    for (const locale of ["am", "es"] as const) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${locale}/billing`);
      await expect(
        page.getByRole("heading", { name: messages[locale].billing.title, exact: true }),
      ).toBeVisible();
      await expect(page.locator(`div[lang="${locale}"][dir="ltr"]`).first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    }
  });

  test("enforces household role projections, cross-household isolation, and safe platform administration", async ({
    browser,
  }) => {
    const owner = await createActor("member", "projection-owner");
    const householdName = `Projection household ${randomUUID().slice(0, 8)}`;
    const householdId = createHousehold(owner.id, householdName);
    setSubscription(householdId, "active", { interval: "year" });
    addPaidInvoice(householdId);

    for (const permission of ["administrator", "member", "viewer"] as const) {
      const actor = await createActor("member", permission);
      addHouseholdRole(householdId, actor.id, permission);
      const session = await openAuthenticatedPage(browser, actor.email, "/en/billing");
      await expect(session.page.getByText("Family Plus", { exact: true })).toBeVisible();
      await expect(session.page.getByText("Subscription active", { exact: true })).toBeVisible();
      await expect(session.page.getByRole("button", { name: "Subscribe with Stripe" })).toHaveCount(0);
      await expect(session.page.getByRole("button", { name: "Open Stripe Customer Portal" })).toHaveCount(0);
      if (permission === "administrator") {
        await expect(session.page.getByText("Annual", { exact: true })).toBeVisible();
        await expect(session.page.getByText("Invoice TEST-028", { exact: true })).toBeVisible();
      } else {
        await expect(session.page.getByText("Annual", { exact: true })).toHaveCount(0);
        await expect(session.page.getByRole("heading", { name: "Billing history" })).toHaveCount(0);
        await expect(session.page.getByText("TEST-028")).toHaveCount(0);
      }
      await session.context.close();
    }

    const otherOwner = await createActor("member", "other-owner");
    createHousehold(otherOwner.id, `Other billing household ${randomUUID().slice(0, 8)}`);
    const otherSession = await openAuthenticatedPage(browser, otherOwner.email, "/en/billing");
    await expect(otherSession.page.getByText(householdName)).toHaveCount(0);
    await expect(otherSession.page.getByText("TEST-028")).toHaveCount(0);
    await otherSession.context.close();

    addFailedWebhookEvent();
    const platformAdmin = await createActor("administrator", "platform-admin");
    const adminSession = await openAuthenticatedPage(browser, platformAdmin.email, "/en/admin/billing");
    await expect(adminSession.page.getByRole("heading", { name: "Subscription operations" })).toBeVisible();
    await expect(adminSession.page.getByText(householdName)).toBeVisible();
    await expect(
      adminSession.page.getByRole("button", { name: "Reconcile with Stripe" }).first(),
    ).toBeVisible();
    await expect(adminSession.page.getByText("invoice.payment_failed")).toBeVisible();
    await expect(adminSession.page.getByText("2 attempts · Error provider_fetch_failed")).toBeVisible();
    await expect(adminSession.page.getByRole("button", { name: /grant|refund|checkout/i })).toHaveCount(0);
    await expectNoSeriousAccessibilityViolations(adminSession.page);
    await adminSession.context.close();
  });
});
