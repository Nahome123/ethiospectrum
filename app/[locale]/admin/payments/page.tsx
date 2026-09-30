import { getTranslations } from "next-intl/server";
import { PaymentStatusBadge } from "@/components/services/status-badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { formatCents } from "@/lib/services/constants";
import { formatShortDateTime } from "@/lib/services/display";
import { listAdminPayments, listAdminRefunds } from "@/lib/services/server";

const paymentFilters = ["all", "paid", "failed", "processing", "partially_refunded", "refunded"] as const;

export default async function AdminPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam }, search] = await Promise.all([params, searchParams]);
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "adminConsole.payments" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const tiers = await getTranslations({ locale, namespace: "services.refundTiers" });
  const status = paymentFilters.find((value) => value === search.status) ?? "all";
  const [payments, refunds] = await Promise.all([
    listAdminPayments(status === "all" ? null : status, 1),
    listAdminRefunds(null, 1),
  ]);

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <section aria-labelledby="refunds-heading" className="space-y-3">
        <h2 className="text-xl font-bold" id="refunds-heading">
          {t("refunds")}
        </h2>
        {refunds.length === 0 ? (
          <p className="rounded-2xl border bg-white p-5 text-muted-foreground">{t("noRefunds")}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <caption className="sr-only">{t("refunds")}</caption>
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3" scope="col">
                    {t("columns.customer")}
                  </th>
                  <th className="px-4 py-3" scope="col">
                    {t("columns.original")}
                  </th>
                  <th className="px-4 py-3" scope="col">
                    {t("columns.refund")}
                  </th>
                  <th className="px-4 py-3" scope="col">
                    {t("columns.reason")}
                  </th>
                  <th className="px-4 py-3" scope="col">
                    {t("columns.status")}
                  </th>
                  <th className="px-4 py-3" scope="col">
                    {t("columns.processed")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {refunds.map((refund) => (
                  <tr className="align-top" key={refund.id}>
                    <td className="px-4 py-3">
                      <Link
                        className="font-semibold text-primary underline"
                        href={`/admin/service-requests/${refund.service_request_id}`}
                      >
                        {refund.household_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{refund.customer_name}</p>
                    </td>
                    <td className="px-4 py-3">{formatCents(refund.original_amount_cents, locale)}</td>
                    <td className="px-4 py-3">
                      {formatCents(refund.refund_amount_cents ?? refund.eligible_amount_cents, locale)}
                      <p className="text-xs text-muted-foreground">{tiers(refund.policy_tier)}</p>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-muted-foreground">{refund.reason}</td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={refund.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {refund.processed_at ? formatShortDateTime(refund.processed_at, locale) : "—"}
                      {refund.processed_by_name ? (
                        <span className="block">{refund.processed_by_name}</span>
                      ) : null}
                      {refund.provider_refund_id ? (
                        <span className="block font-mono">{refund.provider_refund_id}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="payments-heading" className="space-y-3">
        <h2 className="text-xl font-bold" id="payments-heading">
          {t("payments")}
        </h2>
        <nav aria-label={t("filter")} className="flex flex-wrap gap-2">
          {paymentFilters.map((value) => (
            <Link
              aria-current={status === value ? "page" : undefined}
              className={
                status === value
                  ? "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                  : "rounded-full border bg-white px-3 py-1.5 text-sm font-semibold"
              }
              href={value === "all" ? "/admin/payments" : `/admin/payments?status=${value}`}
              key={value}
            >
              {t(`filters.${value}`)}
            </Link>
          ))}
        </nav>
        {payments.length === 0 ? (
          <p className="rounded-2xl border bg-white p-5 text-muted-foreground">{t("noPayments")}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">{t("payments")}</caption>
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3" scope="col">
                    {t("columns.customer")}
                  </th>
                  <th className="px-4 py-3" scope="col">
                    {t("columns.service")}
                  </th>
                  <th className="px-4 py-3" scope="col">
                    {t("columns.amount")}
                  </th>
                  <th className="px-4 py-3" scope="col">
                    {t("columns.status")}
                  </th>
                  <th className="px-4 py-3" scope="col">
                    {t("columns.date")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((payment) => (
                  <tr className="align-top" key={payment.id}>
                    <td className="px-4 py-3">
                      <Link
                        className="font-semibold text-primary underline"
                        href={`/admin/service-requests/${payment.service_request_id}`}
                      >
                        {payment.household_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{payment.payer_name}</p>
                    </td>
                    <td className="px-4 py-3">{types(payment.service_type)}</td>
                    <td className="px-4 py-3">
                      {formatCents(payment.amount_total_cents, locale)}
                      {payment.tax_amount_cents ? (
                        <p className="text-xs text-muted-foreground">
                          {t("tax", { amount: formatCents(payment.tax_amount_cents, locale) })}
                        </p>
                      ) : null}
                      {payment.refunded_amount_cents ? (
                        <p className="text-xs text-muted-foreground">
                          {t("refunded", { amount: formatCents(payment.refunded_amount_cents, locale) })}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={payment.status} />
                      {payment.failure_code ? (
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{payment.failure_code}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatShortDateTime(payment.paid_at ?? payment.created_at, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {t("subscriptionsNote")}{" "}
          <Link className="font-semibold underline" href="/admin/billing">
            {t("subscriptionsLink")}
          </Link>
        </p>
      </section>
    </section>
  );
}
