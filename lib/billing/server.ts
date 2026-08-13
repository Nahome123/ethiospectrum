import "server-only";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

export type HouseholdBillingSummary = {
  household_id: string;
  household_name: string;
  household_permission: "owner" | "administrator" | "member" | "viewer";
  plan_key: string;
  billing_interval: string | null;
  stripe_status: string | null;
  entitlement_status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  provider_updated_at: string | null;
  can_manage_billing: boolean;
  can_view_invoices: boolean;
  has_stripe_customer: boolean;
};

export type BillingInvoice = {
  invoice_id: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  invoice_number: string | null;
  hosted_invoice_url: string | null;
  period_start: string | null;
  period_end: string | null;
  provider_created_at: string;
};

export type AdminBillingSummary = {
  household_id: string;
  household_name: string;
  plan_key: string;
  billing_interval: string | null;
  stripe_status: string | null;
  entitlement_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provider_updated_at: string | null;
  invoice_count: number;
};

export type FailedStripeWebhookEvent = {
  stripe_event_id: string;
  event_type: string;
  attempt_count: number;
  last_error_code: string | null;
  provider_created_at: string;
  updated_at: string;
};

export async function getHouseholdBillingSummary(): Promise<HouseholdBillingSummary | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_household_billing_summary");
  return error || !data?.[0] ? null : (data[0] as HouseholdBillingSummary);
}

export async function listHouseholdBillingInvoices(): Promise<BillingInvoice[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_household_billing_invoices");
  return error || !data ? [] : (data as BillingInvoice[]);
}

export async function hasHouseholdEntitlement(entitlement: "family_plus"): Promise<boolean> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("has_household_entitlement", {
    input_entitlement: entitlement,
  });
  return !error && data === true;
}

export async function listAdminBillingSummaries(): Promise<AdminBillingSummary[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_admin_billing_summaries");
  return error || !data ? [] : (data as AdminBillingSummary[]);
}

export async function listFailedStripeWebhookEvents(): Promise<FailedStripeWebhookEvent[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_failed_stripe_webhook_events");
  return error || !data ? [] : (data as FailedStripeWebhookEvent[]);
}
