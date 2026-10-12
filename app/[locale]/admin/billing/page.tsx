import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { BillingReconcileForm } from "@/components/billing/billing-reconcile-form";
import { ConfirmBillingAction } from "@/components/billing/confirm-billing-action";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminEndMembershipAction, reconcileBillingHouseholdAction } from "@/lib/billing/actions";
import { listAdminBillingSummaries, listFailedStripeWebhookEvents } from "@/lib/billing/server";

/** Subscriptions that still bill or grant access, and so can be ended. */
const liveStatuses = ["trialing", "active", "past_due", "unpaid", "paused", "incomplete"];

function formatDay(value: string | null, locale: AppLocale): string {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value)) : "";
}

export default async function AdminBillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const [t, households, failures] = await Promise.all([
    getTranslations({ locale, namespace: "billing" }),
    listAdminBillingSummaries(),
    listFailedStripeWebhookEvents(),
  ]);
  return (
    <section className="max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-link">{t("admin.eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-bold">{t("admin.title")}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">{t("admin.description")}</p>
      </header>
      <div className="space-y-4">
        {households.map((household) => (
          <Card key={household.household_id}>
            <CardHeader>
              <CardTitle>{household.household_name}</CardTitle>
              <CardDescription>
                {household.plan_key === "rbt_bootcamp" ? t("plans.rbtBootcamp") : t("plans.free")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <div>
                <p className="text-sm text-muted-foreground">{t("admin.subscriptionState")}</p>
                <p className="font-semibold">{household.stripe_status ?? t("statuses.inactive")}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("entitlement")}</p>
                <Badge variant={household.entitlement_status === "active" ? "default" : "outline"}>
                  {household.entitlement_status === "active" ? t("statuses.active") : t("statuses.inactive")}
                </Badge>
              </div>
              <BillingReconcileForm
                action={reconcileBillingHouseholdAction.bind(null, locale)}
                householdId={household.household_id}
                label={t("admin.reconcile")}
                pendingLabel={t("admin.reconciling")}
              />
              {household.stripe_status && liveStatuses.includes(household.stripe_status) ? (
                <div className="border-t border-border pt-4 md:col-span-3">
                  {household.cancel_at_period_end ? (
                    <p className="mb-3 text-sm text-muted-foreground">
                      {t("admin.endsOn", { date: formatDay(household.current_period_end, locale) })}
                    </p>
                  ) : null}
                  <ConfirmBillingAction
                    action={adminEndMembershipAction.bind(null, locale, household.household_id)}
                    confirmLabel={t("admin.endConfirm")}
                    description={t("admin.endDescription", { household: household.household_name })}
                    keepLabel={t("cancel.back")}
                    pendingLabel={t("cancel.saving")}
                    title={t("admin.endTitle")}
                    triggerLabel={t("admin.endMembership")}
                  >
                    <fieldset className="space-y-2 text-sm">
                      <legend className="sr-only">{t("admin.endWhen")}</legend>
                      {household.cancel_at_period_end ? null : (
                        <label className="flex items-start gap-2">
                          <input
                            className="mt-1 size-4"
                            defaultChecked
                            name="mode"
                            type="radio"
                            value="period_end"
                          />
                          <span>
                            <span className="font-semibold">{t("admin.endAtPeriodEnd")}</span>
                            <span className="block text-muted-foreground">
                              {t("admin.endAtPeriodEndHelp")}
                            </span>
                          </span>
                        </label>
                      )}
                      <label className="flex items-start gap-2">
                        <input
                          className="mt-1 size-4"
                          defaultChecked={household.cancel_at_period_end}
                          name="mode"
                          type="radio"
                          value="now"
                        />
                        <span>
                          <span className="font-semibold">{t("admin.endNow")}</span>
                          <span className="block text-muted-foreground">{t("admin.endNowHelp")}</span>
                        </span>
                      </label>
                    </fieldset>
                  </ConfirmBillingAction>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.webhookFailures")}</CardTitle>
          <CardDescription>{t("admin.webhookFailuresDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {failures.length === 0 ? (
            <p>{t("admin.noWebhookFailures")}</p>
          ) : (
            <ul className="space-y-2">
              {failures.map((failure) => (
                <li className="rounded-lg border border-border p-3" key={failure.stripe_event_id}>
                  <p className="font-semibold">{failure.event_type}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.failureSummary", {
                      attempts: failure.attempt_count,
                      code: failure.last_error_code ?? "unknown",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
