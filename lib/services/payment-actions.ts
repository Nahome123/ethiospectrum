"use server";

import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getSiteUrl } from "@/lib/auth/site-url";
import { ensureStripeCustomer } from "@/lib/billing/customer";
import { getStripeClient, isStripeAutomaticTaxEnabled } from "@/lib/billing/provider";
import { getStripeBillingEnv } from "@/lib/env/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentSupabaseClaims, getCurrentUserRole } from "@/lib/supabase/server";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { reasonSchema, refundAmountSchema, uuidSchema } from "@/lib/validation/services";
import { serviceErrorKey, type ServiceActionState } from "./action-state";
import {
  PAYMENT_METADATA_KEY,
  REFUND_METADATA_KEY,
  REQUEST_METADATA_KEY,
  safeProviderCode,
} from "./payments";
import { revalidateServiceRequest } from "./revalidate";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function failure(locale: AppLocale, key: string): Promise<ServiceActionState> {
  const t = await getTranslations({ locale, namespace: "services.errors" });
  return { status: "error", message: t(key) };
}

function paymentsConfigured(): boolean {
  try {
    return Boolean(getStripeBillingEnv());
  } catch {
    return false;
  }
}

/**
 * Starts (or retries) a one-time Consultation / IEP payment. Amounts, fees,
 * and eligibility are derived by `prepare_service_payment`; the browser only
 * supplies the request and the fees it reviewed and accepted.
 */
export async function startServicePaymentAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const request = uuidSchema.safeParse(requestId);
  const feeIds = formData
    .getAll("acceptedFeeIds")
    .filter((value): value is string => typeof value === "string" && uuidSchema.safeParse(value).success);
  if (!request.success) return failure(locale, "validation");
  if (!paymentsConfigured()) return failure(locale, "paymentsUnavailable");
  const claims = await getCurrentSupabaseClaims();
  if (!claims || typeof claims.sub !== "string") return failure(locale, "denied");

  const supabase = await createServerActionSupabaseClient();
  const prepared = await supabase.rpc("prepare_service_payment", {
    target_request_id: request.data,
    input_accepted_fee_ids: feeIds,
    input_fees_acknowledged: field(formData, "feesAcknowledged") === "on",
  });
  const payment = prepared.data?.[0];
  if (prepared.error || !payment) return failure(locale, serviceErrorKey(prepared.error?.code));

  try {
    const admin = createSupabaseAdminClient();
    const stripe = getStripeClient();
    for (const sessionId of payment.superseded_session_ids ?? []) {
      // An abandoned earlier Checkout must not be payable after a retry starts.
      await stripe.checkout.sessions.expire(sessionId).catch(() => undefined);
    }
    const customerId = await ensureStripeCustomer({
      admin,
      stripe,
      householdId: payment.household_id,
      actorId: claims.sub,
    });
    const fees = Array.isArray(payment.fees)
      ? (payment.fees as { name: string; amount_cents: number }[])
      : [];
    const metadata = {
      [PAYMENT_METADATA_KEY]: payment.payment_id,
      [REQUEST_METADATA_KEY]: request.data,
      ethiospectrum_household_id: payment.household_id,
    };
    const siteUrl = getSiteUrl();
    const automaticTax = isStripeAutomaticTaxEnabled();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer: customerId,
        client_reference_id: payment.household_id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: payment.base_amount_cents,
              product_data: { name: payment.service_name },
            },
          },
          ...fees.map((fee) => ({
            quantity: 1,
            price_data: { currency: "usd", unit_amount: fee.amount_cents, product_data: { name: fee.name } },
          })),
        ],
        metadata,
        payment_intent_data: { metadata },
        ...(automaticTax
          ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" as const } }
          : {}),
        success_url: `${siteUrl}/${locale}/requests/${request.data}?payment=return&session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/${locale}/requests/${request.data}?payment=cancelled`,
      },
      { idempotencyKey: `ethiospectrum-service-payment-${payment.payment_id}` },
    );
    if (!session.url) throw new Error("checkout_url_missing");
    const attached = await admin.rpc("attach_service_payment_session", {
      target_payment_id: payment.payment_id,
      input_session_id: session.id,
    });
    if (attached.error) throw new Error("payment_attach_failed");
    revalidateServiceRequest(locale, request.data);
    const t = await getTranslations({ locale, namespace: "services.success" });
    return { status: "success", message: t("redirectingToPayment"), url: session.url };
  } catch {
    return failure(locale, "checkout");
  }
}

async function requireAdministratorId(): Promise<string | null> {
  const claims = await getCurrentSupabaseClaims();
  if (!claims || typeof claims.sub !== "string") return null;
  return (await getCurrentUserRole(claims.sub)) === "administrator" ? claims.sub : null;
}

/**
 * Processes a requested refund through the provider. The amount can never
 * exceed the policy-eligible amount computed by the database.
 */
export async function processRefundAction(
  locale: AppLocale,
  refundId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const id = uuidSchema.safeParse(refundId);
  const amount = refundAmountSchema.safeParse(field(formData, "amountCents"));
  if (!id.success || !amount.success) return failure(locale, "validation");
  const actorId = await requireAdministratorId();
  if (!actorId) return failure(locale, "denied");
  if (!paymentsConfigured()) return failure(locale, "paymentsUnavailable");

  const admin = createSupabaseAdminClient();
  const begun = await admin.rpc("begin_service_refund", {
    target_refund_id: id.data,
    target_actor_id: actorId,
    input_amount_cents: amount.data,
  });
  const refund = begun.data?.[0];
  if (begun.error || !refund) return failure(locale, serviceErrorKey(begun.error?.code));

  let providerRefundId: string | undefined;
  try {
    const created = await getStripeClient().refunds.create(
      {
        payment_intent: refund.provider_transaction_id,
        amount: refund.refund_amount_cents,
        metadata: { [REFUND_METADATA_KEY]: refund.refund_id },
      },
      { idempotencyKey: `ethiospectrum-refund-${refund.refund_id}-${refund.refund_amount_cents}` },
    );
    providerRefundId = created.id;
    if (created.status === "succeeded" || created.status === "failed" || created.status === "canceled") {
      const completed = await admin.rpc("complete_service_refund", {
        target_refund_id: refund.refund_id,
        input_outcome: created.status === "succeeded" ? "succeeded" : "failed",
        input_provider_refund_id: created.id,
        input_failure_code:
          created.status === "succeeded"
            ? undefined
            : safeProviderCode(created.failure_reason, "refund_failed"),
      });
      if (completed.error) throw new Error("refund_completion_failed");
    }
    // A pending provider refund stays `processing` until the refund.updated webhook.
  } catch {
    await admin.rpc("complete_service_refund", {
      target_refund_id: refund.refund_id,
      input_outcome: "failed",
      input_provider_refund_id: providerRefundId,
      input_failure_code: "provider_refund_failed",
    });
    return failure(locale, "refund");
  }
  const { data: refundRow } = await admin
    .from("service_refunds")
    .select("service_request_id")
    .eq("id", refund.refund_id)
    .maybeSingle();
  revalidateServiceRequest(locale, refundRow?.service_request_id);
  const t = await getTranslations({ locale, namespace: "services.success" });
  return { status: "success", message: t("refundProcessed") };
}

export async function rejectRefundAction(
  locale: AppLocale,
  refundId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const id = uuidSchema.safeParse(refundId);
  const reason = reasonSchema.safeParse(field(formData, "reason"));
  if (!id.success || !reason.success) return failure(locale, "validation");
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("admin_reject_service_refund", {
    target_refund_id: id.data,
    input_reason: reason.data,
  });
  if (error) return failure(locale, serviceErrorKey(error.code));
  revalidateServiceRequest(locale);
  const t = await getTranslations({ locale, namespace: "services.success" });
  return { status: "success", message: t("refundRejected") };
}

/** An administrator exception outside the automatic policy (PRD section 26). */
export async function createRefundExceptionAction(
  locale: AppLocale,
  paymentId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const id = uuidSchema.safeParse(paymentId);
  const amount = refundAmountSchema.safeParse(field(formData, "amountCents"));
  const reason = reasonSchema.safeParse(field(formData, "reason"));
  if (!id.success || !amount.success || !reason.success) return failure(locale, "validation");
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("admin_create_service_refund", {
    target_payment_id: id.data,
    input_amount_cents: amount.data,
    input_reason: reason.data,
  });
  if (error) return failure(locale, serviceErrorKey(error.code));
  revalidateServiceRequest(locale);
  const t = await getTranslations({ locale, namespace: "services.success" });
  return { status: "success", message: t("refundRequested") };
}
