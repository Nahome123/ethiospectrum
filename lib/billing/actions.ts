"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getSiteUrl } from "@/lib/auth/site-url";
import { getCurrentHouseholdContext } from "@/lib/households/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentSupabaseClaims, getCurrentUserRole } from "@/lib/supabase/server";
import { billingCheckoutSchema, billingReconciliationSchema } from "@/lib/validation/billing";
import type { BillingActionState } from "./action-state";
import { getConfiguredBillingInterval, getStripeClient, getStripePriceId } from "./provider";
import { reconcileBillingHousehold } from "./sync";

function value(formData: FormData, key: string): string {
  const candidate = formData.get(key);
  return typeof candidate === "string" ? candidate : "";
}

function revalidateBilling(locale: AppLocale) {
  revalidatePath(`/${locale}/billing`);
  revalidatePath(`/${locale}/admin/billing`);
}

async function getOwnerContext() {
  const [context, claims] = await Promise.all([getCurrentHouseholdContext(), getCurrentSupabaseClaims()]);
  if (!context || context.permission !== "owner" || !claims || typeof claims.sub !== "string") {
    return null;
  }
  return { household: context.household, userId: claims.sub };
}

export async function createBillingCheckoutSessionAction(
  locale: AppLocale,
  _state: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  void _state;
  const t = await getTranslations({ locale, namespace: "billing" });
  const parsed = billingCheckoutSchema.safeParse({
    billingInterval: value(formData, "billingInterval"),
  });
  if (!parsed.success) return { status: "error", message: t("errors.validation") };
  const context = await getOwnerContext();
  if (!context) return { status: "error", message: t("errors.ownerRequired") };

  try {
    const admin = createSupabaseAdminClient();
    const stripe = getStripeClient();
    const existingCustomer = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("household_id", context.household.id)
      .maybeSingle();
    if (existingCustomer.error) throw new Error("billing_customer_load_failed");

    let customerId = existingCustomer.data?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { metadata: { ethiospectrum_household_id: context.household.id } },
        { idempotencyKey: `ethiospectrum-household-${context.household.id}` },
      );
      customerId = customer.id;
      const linked = await admin.rpc("link_household_billing_customer", {
        target_household_id: context.household.id,
        target_actor_id: context.userId,
        input_stripe_customer_id: customerId,
      });
      if (linked.error) throw new Error("billing_customer_link_failed");
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });
    const hasManagedSubscription = subscriptions.data.some((subscription) => {
      const priceId = subscription.items.data[0]?.price.id;
      return (
        Boolean(priceId && getConfiguredBillingInterval(priceId)) &&
        subscription.status !== "canceled" &&
        subscription.status !== "incomplete_expired"
      );
    });
    if (hasManagedSubscription) return { status: "error", message: t("errors.updatedElsewhere") };

    const siteUrl = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: context.household.id,
      line_items: [{ price: getStripePriceId(parsed.data.billingInterval), quantity: 1 }],
      metadata: { ethiospectrum_household_id: context.household.id },
      subscription_data: {
        metadata: { ethiospectrum_household_id: context.household.id },
      },
      success_url: `${siteUrl}/${locale}/billing?checkout=success`,
      cancel_url: `${siteUrl}/${locale}/billing?checkout=cancelled`,
    });
    if (!session.url) throw new Error("checkout_url_missing");
    const recorded = await admin.rpc("record_billing_checkout_started", {
      target_household_id: context.household.id,
      target_actor_id: context.userId,
      input_billing_interval: parsed.data.billingInterval,
    });
    if (recorded.error) throw new Error("checkout_audit_failed");
    revalidateBilling(locale);
    return { status: "success", message: t("checkout.redirecting"), url: session.url };
  } catch {
    return { status: "error", message: t("errors.checkout") };
  }
}

export async function createBillingPortalSessionAction(
  locale: AppLocale,
  _state: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  void _state;
  void _formData;
  const t = await getTranslations({ locale, namespace: "billing" });
  const context = await getOwnerContext();
  if (!context) return { status: "error", message: t("errors.ownerRequired") };
  try {
    const admin = createSupabaseAdminClient();
    const customer = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("household_id", context.household.id)
      .maybeSingle();
    if (customer.error || !customer.data) return { status: "error", message: t("errors.noCustomer") };
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customer.data.stripe_customer_id,
      return_url: `${getSiteUrl()}/${locale}/billing`,
    });
    return { status: "success", message: t("portal.redirecting"), url: session.url };
  } catch {
    return { status: "error", message: t("errors.portal") };
  }
}

export async function reconcileBillingHouseholdAction(
  locale: AppLocale,
  _state: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const t = await getTranslations({ locale, namespace: "billing" });
  const parsed = billingReconciliationSchema.safeParse({ householdId: value(formData, "householdId") });
  const claims = await getCurrentSupabaseClaims();
  if (!parsed.success || !claims || typeof claims.sub !== "string") {
    return { status: "error", message: t("errors.validation") };
  }
  const role = await getCurrentUserRole(claims.sub);
  if (role !== "administrator") return { status: "error", message: t("errors.adminRequired") };
  try {
    await reconcileBillingHousehold({
      admin: createSupabaseAdminClient(),
      stripe: getStripeClient(),
      householdId: parsed.data.householdId,
      actorId: claims.sub,
    });
    revalidateBilling(locale);
    return { status: "success", message: t("admin.reconciled") };
  } catch {
    return { status: "error", message: t("errors.reconciliation") };
  }
}
