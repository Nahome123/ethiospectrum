import { CreditCard } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/i18n/routing";
import { cancelServiceRequestAction, requestFollowUpAction } from "@/lib/services/actions";
import {
  formatCents,
  previewCancellationRefund,
  type PaymentStatus,
  type ServiceStatus,
} from "@/lib/services/constants";
import { startServicePaymentAction } from "@/lib/services/payment-actions";
import type { ServiceFee, ServiceRequestBundle } from "@/lib/services/server";

type Props = {
  bundle: ServiceRequestBundle;
  fees: ServiceFee[];
  locale: AppLocale;
  paymentReturn: "return" | "cancelled" | null;
  justCreated: boolean;
  scheduleNotSaved?: boolean;
};

export async function HouseholdRequestPanel({
  bundle,
  fees,
  locale,
  paymentReturn,
  justCreated,
  scheduleNotSaved = false,
}: Props) {
  const { request, appointments } = bundle;
  const t = await getTranslations({ locale, namespace: "services.household" });
  const tiers = await getTranslations({ locale, namespace: "services.refundTiers" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const feeTotal = fees.reduce((total, fee) => total + fee.amount_cents, 0);
  const basePrice = request.price_cents ?? 0;
  const confirmedPrimary = appointments.find(
    (appointment) => appointment.kind === "primary" && appointment.status === "confirmed",
  );
  const cancellable =
    request.can_manage && !["completed", "cancelled", "declined", "in_progress"].includes(request.status);
  const refundPreview = previewCancellationRefund({
    paymentStatus: request.payment_status as PaymentStatus,
    status: request.status as ServiceStatus,
    fullRefundEligible: request.full_refund_eligible,
    refundCapPercent: request.refund_cap_percent,
    confirmedStartAt: confirmedPrimary?.start_at ?? null,
  });
  const paid = request.payment_status === "paid" || request.payment_status === "partially_refunded";

  return (
    <div className="space-y-4">
      {justCreated ? (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          {request.service_type === "iep_language_assistance" ? t("createdIep") : t("created")}
        </p>
      ) : null}
      {scheduleNotSaved ? (
        <p
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
        >
          {t("scheduleNotSaved")}
        </p>
      ) : null}
      {paymentReturn === "return" ? (
        <p
          className={
            paid
              ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
              : "rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          }
          role="status"
        >
          {paid
            ? t("paymentConfirmed")
            : request.payment_status === "failed"
              ? t("paymentFailedReturn")
              : t("paymentProcessing")}
        </p>
      ) : null}
      {paymentReturn === "cancelled" ? (
        <p className="rounded-xl border bg-secondary/40 p-4 text-sm" role="status">
          {t("paymentCancelled")}
        </p>
      ) : null}

      {request.can_pay ? (
        <section
          aria-labelledby="payment-heading"
          className="rounded-2xl border-2 border-primary/40 bg-white p-5 sm:p-6"
        >
          <h2 className="flex items-center gap-2 text-lg font-bold" id="payment-heading">
            <CreditCard aria-hidden="true" className="size-5 text-link" />
            {request.status === "payment_failed" ? t("retryPaymentTitle") : t("paymentTitle")}
          </h2>
          {request.status === "payment_failed" ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {t("paymentFailedNotice")}
            </p>
          ) : null}
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{types(request.service_type)}</dt>
              <dd className="font-semibold">{formatCents(basePrice, locale)}</dd>
            </div>
            {fees.map((fee) => (
              <div className="flex justify-between gap-4" key={fee.id}>
                <dt>
                  {fee.name}
                  <span className="block text-xs text-muted-foreground">{fee.description}</span>
                </dt>
                <dd className="font-semibold">{formatCents(fee.amount_cents, locale)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t pt-2 text-base">
              <dt className="font-semibold">{t("subtotal")}</dt>
              <dd className="font-bold">{formatCents(basePrice + feeTotal, locale)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{t("taxAtCheckout")}</p>
          <ActionForm
            action={startServicePaymentAction.bind(null, locale, request.id)}
            className="mt-4"
            followUrl
            pendingLabel={t("openingPayment")}
            size="lg"
            submitLabel={t("payNow", { amount: formatCents(basePrice + feeTotal, locale) })}
          >
            {fees.map((fee) => (
              <input key={fee.id} name="acceptedFeeIds" type="hidden" value={fee.id} />
            ))}
            {fees.length > 0 ? (
              <label className="flex items-start gap-2 text-sm">
                <input className="mt-1 size-4" name="feesAcknowledged" required type="checkbox" />
                <span>{t("acceptFees", { amount: formatCents(feeTotal, locale) })}</span>
              </label>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("securePayment")}</p>
          </ActionForm>
        </section>
      ) : null}

      {request.payment_status === "pending" || request.payment_status === "processing" ? (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
        >
          {t("paymentInFlight")}
        </p>
      ) : null}

      {request.follow_up_status === "available" && request.can_manage && request.status !== "cancelled" ? (
        <section aria-labelledby="follow-up-heading" className="rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold" id="follow-up-heading">
            {t("followUpTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("followUpDescription")}</p>
          <ActionForm
            action={requestFollowUpAction.bind(null, locale, request.id)}
            className="mt-3"
            pendingLabel={t("sending")}
            submitLabel={t("requestFollowUp")}
          >
            <Label htmlFor="follow-up-note">{t("followUpNote")}</Label>
            <Textarea id="follow-up-note" maxLength={1000} name="note" rows={2} />
          </ActionForm>
        </section>
      ) : null}

      {cancellable ? (
        <details className="rounded-2xl border bg-white p-5 sm:p-6">
          <summary className="cursor-pointer font-semibold">{t("cancelTitle")}</summary>
          <div className="mt-3 space-y-3 text-sm">
            {paid ? (
              <p className="rounded-lg bg-secondary/50 p-3">
                {t("refundPreview", { percent: refundPreview.percent, tier: tiers(refundPreview.tier) })}
              </p>
            ) : (
              <p className="text-muted-foreground">{t("cancelUnpaid")}</p>
            )}
            {paid && refundPreview.percent === 0 ? (
              <p className="text-muted-foreground">{t("rescheduleInstead")}</p>
            ) : null}
            <ActionForm
              action={cancelServiceRequestAction.bind(null, locale, request.id)}
              confirmMessage={t("cancelConfirm")}
              pendingLabel={t("cancelling")}
              submitLabel={t("cancelRequest")}
              variant="destructive"
            >
              <Label htmlFor="cancel-reason">{t("reasonOptional")}</Label>
              <Textarea id="cancel-reason" maxLength={1000} name="reason" rows={2} />
            </ActionForm>
          </div>
        </details>
      ) : null}
    </div>
  );
}
