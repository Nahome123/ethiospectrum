import { CalendarClock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ServiceStatusBadge, StatusPill } from "@/components/services/status-badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { formatShortDateTime } from "@/lib/services/display";
import { listSpecialistServiceRequests, listUpcomingAppointments } from "@/lib/services/server";

export default async function SpecialistDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam }, search] = await Promise.all([params, searchParams]);
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "specialistConsole" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const languages = await getTranslations({ locale, namespace: "services.languages" });
  const delivery = await getTranslations({ locale, namespace: "services.deliveryMethods" });
  const scope = search.scope === "closed" ? "closed" : "active";
  const [requests, upcoming] = await Promise.all([
    listSpecialistServiceRequests(scope, Math.max(1, Number(search.page) || 1)),
    scope === "active" ? listUpcomingAppointments(10) : Promise.resolve([]),
  ]);

  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{scope === "closed" ? t("closedTitle") : t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>
      {scope === "active" ? (
        <section aria-labelledby="specialist-upcoming" className="rounded-2xl border bg-white p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold" id="specialist-upcoming">
            <CalendarClock aria-hidden="true" className="size-5 text-primary" />
            {t("upcoming")}
          </h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("noUpcoming")}</p>
          ) : (
            <ul className="mt-3 divide-y">
              {upcoming.map((appointment) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  key={appointment.appointment_id}
                >
                  <Link
                    className="font-semibold text-primary underline"
                    href={`/specialist/requests/${appointment.service_request_id}`}
                  >
                    {types(appointment.service_type)} · {appointment.dependent_name}
                  </Link>
                  <span className="text-muted-foreground">
                    {formatShortDateTime(appointment.start_at, locale)} ·{" "}
                    {delivery(appointment.delivery_method)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      <section aria-labelledby="specialist-assigned" className="space-y-3">
        <h2 className="text-lg font-bold" id="specialist-assigned">
          {scope === "closed" ? t("closed") : t("assigned")}
        </h2>
        {requests === null ? (
          <p role="alert">{t("loadError")}</p>
        ) : requests.length === 0 ? (
          <p className="rounded-2xl border bg-white p-6 text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="grid gap-3">
            {requests.map((request) => (
              <li key={request.id}>
                <Link
                  className="block rounded-2xl border bg-white p-5 hover:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                  href={`/specialist/requests/${request.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        {types(request.service_type)} · {request.dependent_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {request.household_name} · {languages(request.language)} ·{" "}
                        {delivery(request.delivery_method)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ServiceStatusBadge status={request.status} />
                      {request.availability_requested ? (
                        <StatusPill label={t("availabilityNeeded")} tone="warning" />
                      ) : null}
                      {request.follow_up_status === "requested" ? (
                        <StatusPill label={t("followUpNeeded")} tone="warning" />
                      ) : null}
                    </div>
                  </div>
                  {request.next_appointment_at ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("nextAppointment", {
                        date: formatShortDateTime(request.next_appointment_at, locale),
                      })}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
