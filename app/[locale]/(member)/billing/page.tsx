import { CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { BillingActionForm } from "@/components/billing/billing-action-form";
import { ConfirmBillingAction } from "@/components/billing/confirm-billing-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireHouseholdBillingAccess } from "@/lib/billing/access";
import { setSubscriptionCancellationAction, startTrainingCourseCheckoutAction } from "@/lib/billing/actions";
import { getRbtCoursePriceCents } from "@/lib/billing/public-price";
import { getHouseholdBillingSummary, listHouseholdBillingInvoices } from "@/lib/billing/server";
import { PaymentStatusBadge } from "@/components/services/status-badge";
import { Link } from "@/i18n/navigation";
import { formatCents } from "@/lib/services/constants";
import { listHouseholdPaymentHistory } from "@/lib/services/server";
import { getTrainingCourseStatus } from "@/lib/training/server";

const dateLocales: Record<AppLocale, string> = { en: "en-US", am: "am-ET", es: "es-ES" };

function formatDate(value: string | null, locale: AppLocale): string | null {
  return value
    ? new Intl.DateTimeFormat(dateLocales[locale], { dateStyle: "medium" }).format(new Date(value))
    : null;
}

function formatAmount(amount: number, currency: string, locale: AppLocale): string {
  return new Intl.NumberFormat(dateLocales[locale], {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  await requireHouseholdBillingAccess(locale, `/${locale}/billing`);
  const [{ checkout }, t, summary] = await Promise.all([
    searchParams,
    getTranslations({ locale, namespace: "billing" }),
    getHouseholdBillingSummary(),
  ]);
  const [invoices, servicePayments, course, coursePrice, serviceTypes] = await Promise.all([
    summary?.can_view_invoices ? listHouseholdBillingInvoices() : Promise.resolve([]),
    listHouseholdPaymentHistory(),
    getTrainingCourseStatus(),
    getRbtCoursePriceCents(),
    getTranslations({ locale, namespace: "services.types" }),
  ]);
  const isBillingManager = summary?.can_manage_billing ?? false;
  const legacyActive = Boolean(course?.legacySubscriptionActive);
  const courseActive = Boolean(course?.accessExpiresAt);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-link">{t("eyebrow")}</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="max-w-3xl leading-7 text-muted-foreground">{t("description")}</p>
      </header>

      {checkout === "success" ? (
        <Alert>
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>{t("checkout.confirmingTitle")}</AlertTitle>
          <AlertDescription>{t("checkout.confirmingDescription")}</AlertDescription>
        </Alert>
      ) : null}
      {checkout === "cancelled" ? (
        <Alert>
          <AlertTitle>{t("checkout.cancelledTitle")}</AlertTitle>
          <AlertDescription>{t("checkout.cancelledDescription")}</AlertDescription>
        </Alert>
      ) : null}

      {!summary || !course ? (
        <Alert variant="destructive">
          <AlertTitle>{t("errors.load")}</AlertTitle>
          <AlertDescription>{t("errors.tryAgain")}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("plans.rbtBootcamp")}</CardTitle>
            <CardDescription>
              {coursePrice !== null
                ? t("course.priceWithAmount", { price: formatCents(coursePrice, locale) })
                : t("course.price")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={courseActive || legacyActive ? "default" : "outline"}>
                {courseActive || legacyActive ? t("statuses.active") : t("course.notPurchased")}
              </Badge>
              {courseActive ? (
                <span className="font-semibold">
                  {t("course.accessUntil", { date: formatDate(course.accessExpiresAt, locale) ?? "" })}
                </span>
              ) : null}
            </div>
            {!courseActive && !legacyActive ? (
              <>
                <p className="text-sm text-muted-foreground">{t("course.description")}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  <li>{t("benefits.videos")}</li>
                  <li>{t("benefits.resources")}</li>
                  <li>{t("benefits.progress")}</li>
                </ul>
              </>
            ) : null}
            {course.canPurchase && course.renewable && !legacyActive ? (
              <div className="space-y-2">
                <BillingActionForm
                  action={startTrainingCourseCheckoutAction.bind(null, locale)}
                  label={courseActive || course.accessExpiresAt ? t("course.renew") : t("course.buy")}
                  pendingLabel={t("checkout.starting")}
                />
                {courseActive ? (
                  <p className="text-xs text-muted-foreground">{t("course.renewHint")}</p>
                ) : null}
              </div>
            ) : courseActive ? (
              <p className="text-sm text-muted-foreground">{t("course.renewLater")}</p>
            ) : !course.canPurchase && !legacyActive ? (
              <p className="text-sm font-medium">{t("course.askOwner")}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("certificationDisclaimer")}</p>
          </CardContent>
        </Card>
      )}

      {course && legacyActive && isBillingManager ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("course.legacyTitle")}</CardTitle>
            <CardDescription>
              {course.legacyCancelAtPeriodEnd
                ? t("cancel.scheduledDescription", { date: formatDate(course.legacyPeriodEnd, locale) ?? "" })
                : t("course.legacyDescription", { date: formatDate(course.legacyPeriodEnd, locale) ?? "" })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {course.legacyCancelAtPeriodEnd ? (
              <ConfirmBillingAction
                action={setSubscriptionCancellationAction.bind(null, locale, false)}
                confirmLabel={t("cancel.resumeConfirm")}
                description={t("cancel.resumeDescription")}
                keepLabel={t("cancel.back")}
                pendingLabel={t("cancel.saving")}
                title={t("cancel.resumeTitle")}
                triggerLabel={t("cancel.resume")}
                triggerVariant="default"
              />
            ) : (
              <ConfirmBillingAction
                action={setSubscriptionCancellationAction.bind(null, locale, true)}
                confirmLabel={t("cancel.confirm")}
                description={t("cancel.confirmDescription", {
                  date: formatDate(course.legacyPeriodEnd, locale) ?? t("cancel.periodEnd"),
                })}
                keepLabel={t("cancel.keep")}
                pendingLabel={t("cancel.saving")}
                title={t("cancel.confirmTitle")}
                triggerLabel={t("cancel.trigger")}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {summary?.can_view_invoices ? (
        <section aria-labelledby="history-title" className="space-y-4">
          <div>
            <h2 id="history-title" className="text-2xl font-bold">
              {t("history.title")}
            </h2>
            <p className="mt-1 text-muted-foreground">{t("history.description")}</p>
          </div>
          {invoices.length === 0 ? (
            <Card>
              <CardContent>{t("history.empty")}</CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {invoices.map((invoice) => (
                <li key={invoice.invoice_id}>
                  <Card size="sm">
                    <CardContent className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {invoice.invoice_number
                            ? t("history.invoiceNumber", { number: invoice.invoice_number })
                            : t("history.invoice")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(invoice.provider_created_at, locale)} ·{" "}
                          {formatAmount(
                            invoice.status === "paid" ? invoice.amount_paid : invoice.amount_due,
                            invoice.currency,
                            locale,
                          )}{" "}
                          · {invoice.status === "paid" ? t("statuses.paid") : t("statuses.paymentFailed")}
                        </p>
                      </div>
                      {invoice.hosted_invoice_url ? (
                        <a
                          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                          href={invoice.hosted_invoice_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("history.openReceipt")} <ExternalLink aria-hidden="true" className="size-4" />
                          <span className="sr-only">{t("opensStripe")}</span>
                        </a>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="service-payments-title" className="space-y-4">
        <div>
          <h2 id="service-payments-title" className="text-2xl font-bold">
            {t("servicePayments.title")}
          </h2>
          <p className="mt-1 text-muted-foreground">{t("servicePayments.description")}</p>
        </div>
        {servicePayments.length === 0 ? (
          <Card>
            <CardContent>{t("servicePayments.empty")}</CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {servicePayments.map((payment) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"
                key={payment.id}
              >
                <div>
                  <Link
                    className="font-semibold text-link underline"
                    href={`/requests/${payment.service_request_id}`}
                  >
                    {serviceTypes(payment.service_type)}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(payment.paid_at ?? payment.created_at, locale)} ·{" "}
                    {formatCents(payment.amount_total_cents, locale)}
                    {payment.refunded_amount_cents
                      ? ` · ${t("servicePayments.refunded", { amount: formatCents(payment.refunded_amount_cents, locale) })}`
                      : ""}
                  </p>
                </div>
                <PaymentStatusBadge status={payment.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>{t("secureTitle")}</AlertTitle>
        <AlertDescription>{t("secureDescription")}</AlertDescription>
      </Alert>
    </section>
  );
}
