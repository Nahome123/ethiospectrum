import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("PRD section 41 server-side authorization boundaries", () => {
  it("derives payment amounts in the database, never from the browser", () => {
    const action = read("lib/services/payment-actions.ts");
    expect(action).toContain('supabase.rpc("prepare_service_payment"');
    expect(action).toContain("unit_amount: payment.base_amount_cents");
    expect(action).not.toMatch(/formData\.get\(["'](amount|price|total)/u);
    expect(action).toContain("idempotencyKey: `ethiospectrum-service-payment-${payment.payment_id}`");
  });

  it("never stores raw card data and keeps Stripe server-only", () => {
    for (const file of [
      "lib/services/payments.ts",
      "lib/services/payment-actions.ts",
      "lib/billing/webhook.ts",
      "supabase/migrations/20260929000200_prd_service_requests.sql",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/card_number|\bcvc\b|\bpan\b|payment_method_details/iu);
    }
    for (const file of [
      "components/services/household-request-panel.tsx",
      "components/services/action-form.tsx",
      "components/services/request-detail.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/from ["']stripe["']|STRIPE_SECRET|supabase\/admin/u);
    }
  });

  it("uses the RLS-scoped client for every household, specialist, and staff mutation", () => {
    for (const file of [
      "lib/services/actions.ts",
      "lib/services/staff-actions.ts",
      "lib/services/config-actions.ts",
      "lib/services/document-actions.ts",
      "lib/households/actions.ts",
      "lib/training/actions.ts",
      "lib/training/admin-actions.ts",
    ]) {
      const source = read(file);
      expect(source, file).toContain("createServerActionSupabaseClient");
      expect(source, file).not.toMatch(/createSupabaseAdminClient|supabase\/admin/u);
    }
  });

  it("limits the service role to provider synchronization and refund processing", () => {
    const action = read("lib/services/payment-actions.ts");
    expect(action).toContain('getCurrentUserRole(claims.sub)) === "administrator"');
    expect(action).toContain('admin.rpc("begin_service_refund"');
  });

  it("serves request documents through row- and object-level policies only", () => {
    const route = read("app/api/service-requests/[requestId]/documents/[documentId]/route.ts");
    expect(route).toContain("createRouteHandlerSupabaseClient");
    expect(route).toContain('.eq("service_request_id", requestId)');
    expect(route).toContain("createSignedUrl(document.storage_path, 60");
    expect(route).not.toContain("getPublicUrl");
    expect(route).not.toMatch(/supabase\/admin/u);
  });

  it("keeps specialist access request-scoped in the database", () => {
    const migration = read("supabase/migrations/20260929000200_prd_service_requests.sql");
    expect(migration).toContain("create or replace function private.is_request_specialist");
    expect(migration).not.toMatch(/household_specialists/u);
    expect(migration).toContain("force row level security");
  });

  it("protects subscription-only training media with signed URLs", () => {
    const server = read("lib/training/server.ts");
    expect(server).toContain("createSignedUrl(lesson.video_storage_path, 3600)");
    const migration = read("supabase/migrations/20260929000300_prd_rbt_bootcamp.sql");
    expect(migration).toMatch(/'training-media', 'training-media', false/u);
    expect(migration).toContain("private.has_training_access()");
  });

  it("never adds an automatic travel fee", () => {
    for (const file of [
      "supabase/migrations/20260929000100_prd_service_catalog.sql",
      "supabase/migrations/20260929000200_prd_service_requests.sql",
      "lib/services/payment-actions.ts",
    ]) {
      expect(read(file), file).not.toMatch(/travel_fee|travelFee/iu);
    }
  });
});
