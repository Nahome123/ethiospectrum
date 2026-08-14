import { CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { BillingActionForm } from "@/components/billing/billing-action-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireHouseholdBillingAccess } from "@/lib/billing/access";
import { createBillingCheckoutSessionAction, createBillingPortalSessionAction } from "@/lib/billing/actions";
import { getHouseholdBillingSummary, listHouseholdBillingInvoices } from "@/lib/billing/server";

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
  const invoices = summary?.can_view_invoices ? await listHouseholdBillingInvoices() : [];
  const isBillingManager = summary?.can_manage_billing ?? false;
  const showsBillingDetails = summary?.can_view_invoices ?? false;
  const active = summary?.entitlement_status === "active";

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-primary">{t("eyebrow")}</p>
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

      {!summary ? (
        <Alert variant="destructive">
          <AlertTitle>{t("errors.load")}</AlertTitle>
          <AlertDescription>{t("errors.tryAgain")}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("currentPlan")}</CardTitle>
            <CardDescription>{summary.household_name}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">{t("plan")}</p>
              <p className="mt-1 text-xl font-bold">
                {summary.plan_key === "family_plus" ? t("plans.familyPlus") : t("plans.free")}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("entitlement")}</p>
              <Badge className="mt-1" variant={active ? "default" : "outline"}>
                {active ? t("statuses.active") : t("statuses.inactive")}
              </Badge>
            </div>
            {showsBillingDetails && summary.billing_interval ? (
              <div>
                <p className="text-sm text-muted-foreground">{t("billingInterval")}</p>
                <p className="mt-1 font-semibold">
                  {summary.billing_interval === "year" ? t("intervals.annual") : t("intervals.monthly")}
                </p>
              </div>
            ) : null}
            {showsBillingDetails && summary.current_period_end ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  {summary.cancel_at_period_end ? t("accessThrough") : t("currentPeriod")}
                </p>
                <p className="mt-1 font-semibold">{formatDate(summary.current_period_end, locale)}</p>
              </div>
            ) : null}
            {showsBillingDetails && summary.cancel_at_period_end ? (
              <div className="sm:col-span-2">
                <Badge variant="outline">{t("statuses.cancellationScheduled")}</Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {summary && isBillingManager && summary.plan_key === "free" ? (
        <section aria-labelledby="plans-title" className="space-y-4">
          <div>
            <h2 id="plans-title" className="text-2xl font-bold">
              {t("choosePlan")}
            </h2>
            <p className="mt-1 text-muted-foreground">{t("amountManagedByStripe")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(["month", "year"] as const).map((interval) => (
              <Card key={interval}>
                <CardHeader>
                  <CardTitle>
                    {interval === "month" ? t("intervals.monthly") : t("intervals.annual")}
                  </CardTitle>
                  <CardDescription>{t("plans.familyPlus")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <BillingActionForm
                    action={createBillingCheckoutSessionAction.bind(null, locale)}
                    label={t("subscribe")}
                    pendingLabel={t("checkout.starting")}
                    billingInterval={interval}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {summary && isBillingManager && summary.has_stripe_customer ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("manageBilling")}</CardTitle>
            <CardDescription>{t("portal.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BillingActionForm
              action={createBillingPortalSessionAction.bind(null, locale)}
              label={t("portal.open")}
              pendingLabel={t("portal.opening")}
              variant="outline"
            />
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

      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>{t("secureTitle")}</AlertTitle>
        <AlertDescription>{t("secureDescription")}</AlertDescription>
      </Alert>
    </section>
  );
}
