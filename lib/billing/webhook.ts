import "server-only";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BillingProviderDataError } from "./mapping";
import { getStripeClient, getStripeWebhookSecret } from "./provider";
import { isStripeBillingEventType } from "./constants";
import { syncStripeInvoice, syncStripeSubscription } from "./sync";

type BillingAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type StripeWebhookDependencies = {
  stripe?: Stripe;
  admin?: BillingAdminClient;
  webhookSecret?: string;
};

function id(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function safeFailureCode(error: unknown): string {
  return error instanceof BillingProviderDataError ? error.safeCode : "webhook_processing_failed";
}

export async function handleStripeWebhookRequest(
  request: Request,
  dependencies: StripeWebhookDependencies = {},
): Promise<NextResponse> {
  const stripe = dependencies.stripe ?? getStripeClient();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse(null, { status: 400 });

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      dependencies.webhookSecret ?? getStripeWebhookSecret(),
    );
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (!isStripeBillingEventType(event.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const admin = dependencies.admin ?? createSupabaseAdminClient();
  const providerCreatedAt = new Date(event.created * 1000).toISOString();
  const begun = await admin.rpc("begin_stripe_webhook_event", {
    input_stripe_event_id: event.id,
    input_event_type: event.type,
    input_api_version: event.api_version ?? "unknown",
    input_provider_created_at: providerCreatedAt,
  });
  if (begun.error) return new NextResponse(null, { status: 503 });
  if (begun.data === "duplicate") return NextResponse.json({ received: true, duplicate: true });
  if (begun.data !== "process") return new NextResponse(null, { status: 503 });

  let householdId: string | undefined;
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = id(session.subscription);
      if (subscriptionId) {
        householdId = await syncStripeSubscription({
          admin,
          stripe,
          subscriptionId,
          providerUpdatedAt: providerCreatedAt,
        });
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      householdId = await syncStripeSubscription({
        admin,
        stripe,
        subscriptionId: subscription.id,
        providerUpdatedAt: providerCreatedAt,
      });
    } else {
      const invoice = event.data.object as Stripe.Invoice;
      householdId = await syncStripeInvoice({
        admin,
        stripe,
        invoiceId: invoice.id,
        providerUpdatedAt: providerCreatedAt,
      });
    }

    const completed = await admin.rpc("complete_stripe_webhook_event", {
      input_stripe_event_id: event.id,
    });
    if (completed.error) throw new Error("webhook_completion_failed");
    return NextResponse.json({ received: true });
  } catch (error) {
    await admin.rpc("fail_stripe_webhook_event", {
      input_stripe_event_id: event.id,
      input_error_code: safeFailureCode(error),
      target_household_id: householdId,
    });
    return new NextResponse(null, { status: 503 });
  }
}
