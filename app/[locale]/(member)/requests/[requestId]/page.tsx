import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { HouseholdRequestPanel } from "@/components/services/household-request-panel";
import { RequestDetailView } from "@/components/services/request-detail";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getStripeClient } from "@/lib/billing/provider";
import { getStripeBillingEnv } from "@/lib/env/server";
import { syncServicePaymentFromSession } from "@/lib/services/payments";
import { getServiceRequestBundle, listActiveFees } from "@/lib/services/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uuidSchema } from "@/lib/validation/services";

/**
 * On return from Stripe Checkout, re-fetch the session from Stripe and apply
 * it, so the page reflects the provider's authoritative state even before the
 * webhook arrives. Failures fall back silently to the webhook path.
 */
async function reconcileReturnedCheckout(requestId: string, sessionId: string): Promise<void> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return;
  try {
    if (!getStripeBillingEnv()) return;
    await syncServicePaymentFromSession({
      admin: createSupabaseAdminClient(),
      stripe: getStripeClient(),
      sessionId,
      providerUpdatedAt: new Date().toISOString(),
    }).then((result) => {
      if (result && result.serviceRequestId !== requestId) throw new Error("request_mismatch");
    });
  } catch {
    // The signed webhook remains the authoritative, retried synchronization path.
  }
}

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; requestId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam, requestId }, search] = await Promise.all([params, searchParams]);
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "services.detail" });
  if (!uuidSchema.safeParse(requestId).success) return <p role="alert">{t("notFound")}</p>;

  const payment = typeof search.payment === "string" ? search.payment : null;
  const session = typeof search.session === "string" ? search.session : null;
  if (payment === "return" && session) await reconcileReturnedCheckout(requestId, session);

  const bundle = await getServiceRequestBundle(requestId);
  if (!bundle) {
    return (
      <section className="mx-auto max-w-3xl">
        <p role="alert">{t("notFound")}</p>
        <Link className="mt-3 inline-block text-sm font-semibold underline" href="/requests">
          {t("backToRequests")}
        </Link>
      </section>
    );
  }
  if (bundle.request.viewer_role === "administrator")
    redirect(`/${locale}/admin/service-requests/${requestId}`);
  if (bundle.request.viewer_role === "specialist") redirect(`/${locale}/specialist/requests/${requestId}`);

  const fees = bundle.request.can_pay ? await listActiveFees(bundle.request.service_type) : [];

  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <Link className="text-sm font-semibold text-primary underline underline-offset-4" href="/requests">
        {t("backToRequests")}
      </Link>
      <RequestDetailView
        audience="household"
        bundle={bundle}
        locale={locale}
        panel={
          <HouseholdRequestPanel
            bundle={bundle}
            fees={fees}
            justCreated={search.created === "1"}
            scheduleNotSaved={search.scheduleError === "1"}
            locale={locale}
            paymentReturn={payment === "return" ? "return" : payment === "cancelled" ? "cancelled" : null}
          />
        }
      />
    </section>
  );
}
