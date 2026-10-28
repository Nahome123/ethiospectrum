"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getSiteUrl } from "@/lib/auth/site-url";
import { getHouseholdAccess } from "@/lib/households/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentSupabaseClaims, getCurrentUserRole } from "@/lib/supabase/server";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { billingReconciliationSchema } from "@/lib/validation/billing";
import type { BillingActionState } from "./action-state";
import { ensureStripeCustomer } from "./customer";
import { TRAINING_COURSE_METADATA_KEY } from "./course";
import { getRbtCoursePriceId, getStripeClient } from "./provider";
import { reconcileBillingHousehold } from "./sync";
import {
  cancelSubscriptionNow,
  findLiveHouseholdSubscription,
  setCancelAtPeriodEnd,
} from "./subscription-control";

function value(formData: FormData, key: string): string {
  const candidate = formData.get(key);
  return typeof candidate === "string" ? candidate : "";
}

function revalidateBilling(locale: AppLocale) {
  revalidatePath(`/${locale}/billing`);
  revalidatePath(`/${locale}/training`);
  revalidatePath(`/${locale}/admin/billing`);
}

/** The owner, or a caregiver granted `manage_subscription`, may manage the subscription. */
async function getSubscriptionManagerContext() {
  const [access, claims] = await Promise.all([getHouseholdAccess(), getCurrentSupabaseClaims()]);
  if (
    !access ||
    !access.permissions.includes("manage_subscription") ||
    !claims ||
    typeof claims.sub !== "string"
  ) {
    return null;
  }
  return { household: access.household, userId: claims.sub };
}

/**
 * Buys (or renews) RBT Boot Camp: a one-time Checkout for the configured
 * course Price. Whether the household may buy now (no access, or in its last
 * 30 days) is decided by the database; the Price comes from server config.
 */
export async function startTrainingCourseCheckoutAction(
  locale: AppLocale,
  _state: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  void _state;
  void _formData;
  const t = await getTranslations({ locale, namespace: "billing" });
  const context = await getSubscriptionManagerContext();
  if (!context) return { status: "error", message: t("errors.ownerRequired") };
  const supabase = await createServerActionSupabaseClient();
  const { data: statusRows, error: statusError } = await supabase.rpc("get_training_course_status");
  const status = statusRows?.[0];
  if (statusError || !status?.can_purchase) return { status: "error", message: t("errors.ownerRequired") };
  if (!status.renewable) return { status: "error", message: t("errors.courseActive") };

  try {
    const admin = createSupabaseAdminClient();
    const stripe = getStripeClient();
    const customerId = await ensureStripeCustomer({
      admin,
      stripe,
      householdId: context.household.id,
      actorId: context.userId,
    });
    const metadata = {
      [TRAINING_COURSE_METADATA_KEY]: "rbt_bootcamp",
      ethiospectrum_household_id: context.household.id,
      ethiospectrum_actor_id: context.userId,
    };
    const siteUrl = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      ui_mode: "hosted_page",
      mode: "payment",
      customer: customerId,
      client_reference_id: context.household.id,
      line_items: [{ price: getRbtCoursePriceId(), quantity: 1 }],
      metadata,
      payment_intent_data: { metadata },
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      submit_type: "pay",
      integration_identifier: "hosted_web_0001",
      origin_context: "web",
      success_url: `${siteUrl}/${locale}/billing?checkout=success`,
      cancel_url: `${siteUrl}/${locale}/billing?checkout=cancelled`,
    });
    if (!session.url) throw new Error("checkout_url_missing");
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
  const context = await getSubscriptionManagerContext();
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
  } catch (error) {
    // The message only (no customer data), so failures can be traced in the logs.
    console.error("billing reconciliation failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return { status: "error", message: t("errors.reconciliation") };
  }
}

/** Best-effort audit entry; billing changes are also recorded by Stripe. */
async function recordBillingAudit(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  entry: { actorId: string; householdId: string; action: string; metadata: Record<string, string | boolean> },
) {
  const { error } = await admin.rpc("record_admin_audit_event", {
    input_actor_id: entry.actorId,
    input_action: entry.action,
    input_entity_type: "subscription",
    input_entity_id: entry.householdId,
    input_household_id: entry.householdId,
    input_metadata: entry.metadata,
  });
  if (error) console.error("billing audit failed", { code: error.code, message: error.message });
}

/**
 * Lets the household's subscription manager cancel at the end of the paid
 * period (`cancel` true) or withdraw a scheduled cancellation (`cancel` false).
 * Access continues until the period ends; nothing is refunded.
 */
export async function setSubscriptionCancellationAction(
  locale: AppLocale,
  cancel: boolean,
  _state: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  void _state;
  void _formData;
  const t = await getTranslations({ locale, namespace: "billing" });
  const context = await getSubscriptionManagerContext();
  if (!context) return { status: "error", message: t("errors.ownerRequired") };
  try {
    const admin = createSupabaseAdminClient();
    const subscription = await findLiveHouseholdSubscription(admin, context.household.id);
    if (!subscription) return { status: "error", message: t("cancel.noSubscription") };
    if (subscription.cancelAtPeriodEnd !== cancel) {
      await setCancelAtPeriodEnd({
        admin,
        stripe: getStripeClient(),
        subscriptionId: subscription.subscriptionId,
        cancel,
      });
      await recordBillingAudit(admin, {
        actorId: context.userId,
        householdId: context.household.id,
        action: cancel ? "subscription_cancellation_scheduled" : "subscription_resumed",
        metadata: { by: "member" },
      });
    }
    revalidateBilling(locale);
    return { status: "success", message: t(cancel ? "cancel.scheduled" : "cancel.resumed") };
  } catch {
    return { status: "error", message: t("errors.cancel") };
  }
}

/**
 * Administrator: end a household's membership at the end of the paid period
 * or immediately (no refund). The form sends `mode` = "period_end" | "now".
 */
export async function adminEndMembershipAction(
  locale: AppLocale,
  householdId: string,
  _state: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  void _state;
  const t = await getTranslations({ locale, namespace: "billing" });
  const parsed = billingReconciliationSchema.safeParse({ householdId });
  const mode = value(formData, "mode");
  const claims = await getCurrentSupabaseClaims();
  if (
    !parsed.success ||
    (mode !== "period_end" && mode !== "now") ||
    !claims ||
    typeof claims.sub !== "string"
  ) {
    return { status: "error", message: t("errors.validation") };
  }
  if ((await getCurrentUserRole(claims.sub)) !== "administrator") {
    return { status: "error", message: t("errors.adminRequired") };
  }
  try {
    const admin = createSupabaseAdminClient();
    const stripe = getStripeClient();
    const subscription = await findLiveHouseholdSubscription(admin, parsed.data.householdId);
    if (!subscription) return { status: "error", message: t("cancel.noSubscription") };
    if (mode === "now") {
      await cancelSubscriptionNow({ admin, stripe, subscriptionId: subscription.subscriptionId });
    } else {
      await setCancelAtPeriodEnd({
        admin,
        stripe,
        subscriptionId: subscription.subscriptionId,
        cancel: true,
      });
    }
    await recordBillingAudit(admin, {
      actorId: claims.sub,
      householdId: parsed.data.householdId,
      action: mode === "now" ? "membership_ended" : "subscription_cancellation_scheduled",
      metadata: { by: "administrator", mode },
    });
    revalidateBilling(locale);
    return { status: "success", message: t(mode === "now" ? "admin.endedNow" : "admin.endsAtPeriodEnd") };
  } catch {
    return { status: "error", message: t("errors.cancel") };
  }
}
