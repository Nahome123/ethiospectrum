import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const actionSource = read("lib/billing/actions.ts");
const webhookSource = read("lib/billing/webhook.ts");
const routeSource = read("app/api/stripe/webhook/route.ts");
const migrationSource = read("supabase/migrations/20260807000000_stripe_subscriptions.sql");

describe("ETH-028 security architecture", () => {
  it("exports only async Server Actions", () => {
    expect(actionSource.startsWith('"use server"')).toBe(true);
    const exports = [...actionSource.matchAll(/^export\s+([^\n]+)/gm)].map((match) => match[1]);
    expect(exports).toHaveLength(3);
    expect(exports.every((statement) => statement.startsWith("async function"))).toBe(true);
  });

  it("keeps Stripe and server secrets out of Client Components", () => {
    for (const file of [
      "components/billing/billing-action-form.tsx",
      "components/billing/billing-reconcile-form.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain('"use client"');
      expect(source).not.toMatch(/from ["']stripe["']|process\.env|SUPABASE_SECRET|STRIPE_SECRET/iu);
      expect(source).not.toMatch(/supabase\/admin|createSupabaseAdminClient/u);
    }
  });

  it("validates only interval while resolving Price IDs server-side", () => {
    const checkoutAction = actionSource.split("export async function createBillingPortalSessionAction")[0];
    expect(checkoutAction).toContain("billingCheckoutSchema");
    expect(checkoutAction).toContain("getStripePriceId(parsed.data.billingInterval)");
    expect(checkoutAction).not.toMatch(/formData.*price|value\(formData, ["']price/iu);
    expect(checkoutAction).not.toMatch(/value\(formData, ["']household/iu);
    expect(checkoutAction).not.toMatch(/value\(formData, ["']customer/iu);
  });

  it("uses raw-body signature verification and an explicit event allowlist", () => {
    expect(webhookSource).toContain("request.text()");
    expect(webhookSource).toContain("webhooks.constructEvent");
    expect(webhookSource).toContain("isStripeBillingEventType");
    expect(routeSource).toContain('runtime = "nodejs"');
    expect(webhookSource).not.toMatch(/console\.(log|warn|error|info|debug)/u);
  });

  it("forces RLS and denies browser writes on every billing table", () => {
    for (const table of [
      "billing_customers",
      "billing_subscriptions",
      "billing_invoices",
      "stripe_webhook_events",
      "billing_events",
    ]) {
      expect(migrationSource).toContain(`alter table public.${table} force row level security`);
    }
    expect(migrationSource).toContain("from public, anon, authenticated");
    expect(migrationSource).not.toMatch(/grant (insert|update|delete).*authenticated/iu);
    expect(migrationSource).not.toMatch(/grant select on public\.[^;]+ to authenticated/iu);
  });

  it("keeps audit metadata bounded and card data outside the schema", () => {
    expect(migrationSource).toContain("billing_events_immutable");
    expect(migrationSource).toContain("octet_length(safe_metadata::text) <= 2048");
    expect(migrationSource).not.toMatch(/card_number|\bpan\b|\bcvc\b|payment_method_json|raw_payload/iu);
  });

  it("keeps ETH-027 billing-free and ETH-029 email absent", () => {
    for (const file of [
      "lib/appointments/actions.ts",
      "lib/appointments/server.ts",
      "supabase/migrations/20260806000000_appointment_scheduling.sql",
    ]) {
      expect(read(file)).not.toMatch(/stripe|subscription|invoice|checkout/iu);
    }
    for (const file of [
      "lib/billing/actions.ts",
      "lib/billing/webhook.ts",
      "supabase/migrations/20260807000000_stripe_subscriptions.sql",
    ]) {
      expect(read(file)).not.toMatch(/resend|sendEmail|sendSms|transactional.?email/iu);
    }
  });

  it("does not grant entitlement from the Checkout return URL", () => {
    const page = read("app/[locale]/(member)/billing/page.tsx");
    const access = read("lib/billing/access.ts");
    expect(page).toContain("requireHouseholdBillingAccess");
    expect(access).toContain('user.role === "administrator"');
    expect(access).toContain('context?.permission === "owner"');
    expect(access).not.toMatch(/createSupabaseAdminClient|supabase\/admin/u);
    expect(page).toContain('t("checkout.confirmingDescription")');
    expect(page).not.toMatch(/update.*entitlement|grant.*entitlement/iu);
  });
});
