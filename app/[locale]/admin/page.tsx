import { CalendarClock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { adminQueueValues } from "@/lib/services/constants";
import { formatShortDateTime } from "@/lib/services/display";
import { getAdminQueueCounts, listUpcomingAppointments } from "@/lib/services/server";

/** Queues that need an administrator decision are highlighted. */
const attentionQueues = new Set([
  "new",
  "unassigned",
  "payment_failed",
  "reschedule",
  "refunds",
  "follow_up",
  "no_show",
]);

export default async function AdminOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "adminConsole" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const [counts, upcoming] = await Promise.all([getAdminQueueCounts(), listUpcomingAppointments(8)]);

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t("overviewTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("overviewDescription")}</p>
      </div>
      <ul aria-label={t("queues")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {adminQueueValues.map((queue) => {
          const count = counts[queue] ?? 0;
          const highlighted = attentionQueues.has(queue) && count > 0;
          return (
            <li key={queue}>
              <Link
                className={
                  highlighted
                    ? "block rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                    : "block rounded-2xl border bg-white p-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                }
                href={`/admin/service-requests?queue=${queue}`}
              >
                <p className="text-sm font-semibold text-muted-foreground">{t(`queue.${queue}`)}</p>
                <p className="mt-1 text-3xl font-bold">{count}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      <section aria-labelledby="upcoming-heading" className="rounded-2xl border bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold" id="upcoming-heading">
          <CalendarClock aria-hidden="true" className="size-5 text-link" />
          {t("upcomingAppointments")}
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
                  className="font-semibold text-link underline"
                  href={`/admin/service-requests/${appointment.service_request_id}`}
                >
                  {types(appointment.service_type)} · {appointment.household_name}
                </Link>
                <span className="text-muted-foreground">
                  {formatShortDateTime(appointment.start_at, locale)} · {appointment.specialist_name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <nav aria-label={t("shortcuts")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["payments", "services", "specialists", "training"] as const).map((shortcut) => (
          <Link
            className="rounded-2xl border bg-white p-4 font-semibold hover:border-primary"
            href={`/admin/${shortcut}`}
            key={shortcut}
          >
            {t(`shortcut.${shortcut}`)}
          </Link>
        ))}
      </nav>
    </section>
  );
}
