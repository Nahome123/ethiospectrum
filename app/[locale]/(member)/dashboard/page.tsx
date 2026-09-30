import {
  BookOpen,
  CalendarClock,
  ChevronRight,
  CreditCard,
  HousePlus,
  ListChecks,
  UsersRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { PaymentStatusBadge, ServiceStatusBadge, StatusPill } from "@/components/services/status-badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getHouseholdBillingSummary } from "@/lib/billing/server";
import { getHouseholdAccess } from "@/lib/households/server";
import { formatCents } from "@/lib/services/constants";
import { formatShortDateTime } from "@/lib/services/display";
import {
  listDependentOptions,
  listHouseholdServiceRequests,
  listServices,
  listUpcomingAppointments,
} from "@/lib/services/server";
import { getTrainingAccess, getTrainingProgressSummary } from "@/lib/training/server";

function Panel({
  title,
  icon: Icon,
  href,
  linkLabel,
  children,
  id,
}: {
  title: string;
  icon: typeof BookOpen;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold" id={id}>
          <Icon aria-hidden="true" className="size-5 text-primary" />
          {title}
        </h2>
        {href && linkLabel ? (
          <Link className="inline-flex items-center gap-1 text-sm font-semibold text-primary" href={href}>
            {linkLabel}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeValue }, search] = await Promise.all([params, searchParams]);
  const locale = localeValue as AppLocale;
  const t = await getTranslations({ locale, namespace: "customerDashboard" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const access = await getHouseholdAccess();

  if (!access) {
    const onboardingT = await getTranslations({ locale, namespace: "onboarding" });
    return (
      <section className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <HousePlus aria-hidden="true" className="size-9 text-primary" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight">{onboardingT("title")}</h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{onboardingT("description")}</p>
          <p className="mt-3 text-sm text-muted-foreground">{t("caregiverHint")}</p>
          <div className="mt-8">
            <OnboardingForm locale={locale} />
          </div>
        </div>
      </section>
    );
  }

  const [active, history, upcoming, training, progress, billing, services, dependents] = await Promise.all([
    listHouseholdServiceRequests("active", 1),
    listHouseholdServiceRequests("closed", 1),
    listUpcomingAppointments(5),
    getTrainingAccess(),
    getTrainingProgressSummary(),
    getHouseholdBillingSummary(),
    listServices(),
    listDependentOptions(access.household.id),
  ]);
  const activeRequests = active ?? [];
  const pendingPayments = activeRequests.filter((request) =>
    ["awaiting_payment", "payment_failed"].includes(request.status),
  );
  const subscriptionActive = billing?.entitlement_status === "active";

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">{access.household.name}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{t("welcome")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t("intro")}</p>
        </div>
        {access.permissions.includes("submit_requests") ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            href="/services"
          >
            {t("requestService")}
          </Link>
        ) : null}
      </div>
      {search.joined === "1" ? (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          {t("joinedHousehold", { household: access.household.name })}
        </p>
      ) : null}

      {pendingPayments.length > 0 ? (
        <section
          aria-labelledby="pending-payments"
          className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5"
        >
          <h2 className="flex items-center gap-2 font-bold" id="pending-payments">
            <CreditCard aria-hidden="true" className="size-5" />
            {t("pendingPayments", { count: pendingPayments.length })}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {pendingPayments.map((request) => (
              <li className="flex flex-wrap items-center justify-between gap-2" key={request.id}>
                <span>
                  {types(request.service_type)} · {request.dependent_name} ·{" "}
                  {formatCents(request.amount_cents, locale)}
                </span>
                <Link className="font-semibold underline" href={`/requests/${request.id}`}>
                  {request.status === "payment_failed" ? t("retryPayment") : t("payNow")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          href="/requests"
          icon={CalendarClock}
          id="upcoming-title"
          linkLabel={t("allRequests")}
          title={t("upcoming")}
        >
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noUpcoming")}</p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((appointment) => (
                <li className="py-3" key={appointment.appointment_id}>
                  <Link
                    className="font-semibold text-primary underline"
                    href={`/requests/${appointment.service_request_id}`}
                  >
                    {types(appointment.service_type)} · {appointment.dependent_name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatShortDateTime(appointment.start_at, locale)} · {appointment.specialist_name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          href={training.hasAccess ? "/training" : "/billing"}
          icon={BookOpen}
          id="training-title"
          linkLabel={training.hasAccess ? t("openTraining") : t("viewSubscription")}
          title={t("rbtBootcamp")}
        >
          <div className="flex items-center gap-2">
            <StatusPill
              label={subscriptionActive ? t("subscriptionActive") : t("subscriptionInactive")}
              tone={subscriptionActive ? "success" : "neutral"}
            />
            {billing?.cancel_at_period_end && billing.current_period_end ? (
              <span className="text-xs text-muted-foreground">
                {t("endsOn", { date: formatShortDateTime(billing.current_period_end, locale) })}
              </span>
            ) : null}
          </div>
          {training.hasAccess && progress.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {progress.map((learner) => {
                const total = Number(learner.total_lessons);
                const done = Number(learner.completed_lessons);
                const percent = total ? Math.round((done / total) * 100) : 0;
                return (
                  <li key={`${learner.learner_type}-${learner.learner_id}`}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">
                        {learner.learner_type === "member" ? t("you") : learner.learner_name}
                      </span>
                      <span className="text-muted-foreground">{t("lessonsDone", { done, total })}</span>
                    </div>
                    <div
                      aria-label={learner.learner_name}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={percent}
                      className="mt-1 h-2 overflow-hidden rounded-full bg-secondary"
                      role="progressbar"
                    >
                      <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {training.hasAccess ? t("startTraining") : t("trainingLocked")}
            </p>
          )}
        </Panel>

        <Panel
          href="/requests"
          icon={ListChecks}
          id="requests-title"
          linkLabel={t("allRequests")}
          title={t("activeRequests")}
        >
          {activeRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noActiveRequests")}</p>
          ) : (
            <ul className="divide-y">
              {activeRequests.slice(0, 5).map((request) => (
                <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={request.id}>
                  <Link className="font-semibold text-primary underline" href={`/requests/${request.id}`}>
                    {types(request.service_type)} · {request.dependent_name}
                  </Link>
                  <span className="flex gap-2">
                    <ServiceStatusBadge status={request.status} />
                    <PaymentStatusBadge status={request.payment_status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          href="/dependents"
          icon={UsersRound}
          id="dependents-title"
          linkLabel={t("manageDependents")}
          title={t("dependents")}
        >
          {dependents.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              <p>{t("noDependents")}</p>
              <Link className="mt-2 inline-block font-semibold text-primary underline" href="/dependents/new">
                {t("addDependent")}
              </Link>
            </div>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {dependents.map((dependent) => (
                <li key={dependent.id}>
                  <Link
                    className="inline-block rounded-full border px-3 py-1 text-sm font-medium hover:border-primary"
                    href={`/dependents/${dependent.id}`}
                  >
                    {dependent.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section aria-labelledby="available-services" className="space-y-3">
        <h2 className="text-lg font-bold" id="available-services">
          {t("availableServices")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {services
            .filter((service) => service.active)
            .map((service) => (
              <li key={service.id}>
                <Link className="block rounded-2xl border bg-white p-4 hover:border-primary" href="/services">
                  <p className="font-semibold">{types(service.service_type)}</p>
                  <p className="text-sm text-muted-foreground">
                    {service.service_type === "rbt_bootcamp"
                      ? t("monthly")
                      : `${formatCents(service.price_cents, locale)} · ${t("oneTime")}`}
                  </p>
                </Link>
              </li>
            ))}
        </ul>
        <p className="text-sm text-muted-foreground">{t("independentNotice")}</p>
      </section>

      <Panel icon={ListChecks} id="history-title" title={t("history")}>
        {(history ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
        ) : (
          <ul className="divide-y">
            {(history ?? []).slice(0, 5).map((request) => (
              <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" key={request.id}>
                <Link className="font-semibold text-primary underline" href={`/requests/${request.id}`}>
                  {types(request.service_type)} · {request.dependent_name}
                </Link>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {formatShortDateTime(request.updated_at, locale)}
                  <ServiceStatusBadge status={request.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
