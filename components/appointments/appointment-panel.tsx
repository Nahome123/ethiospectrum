import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { AppointmentConsentForm } from "./appointment-consent-form";
import { AppointmentLifecycleControls } from "./appointment-lifecycle-controls";
import { formatAppointmentInZone } from "@/lib/appointments/scheduling";
import { isSupportedTimezone } from "@/lib/appointments/scheduling";
import type { AppointmentEvent, SupportAppointment } from "@/lib/appointments/server";

const statusStyles: Record<string, string> = {
  proposed: "bg-primary/10 text-primary",
  scheduled: "bg-primary/15 text-primary",
  declined: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
  completed: "bg-secondary text-secondary-foreground",
};

/**
 * One panel serves the household, specialist, and administrator views. What each
 * audience may do arrives as server-derived capability flags, and the meeting
 * link is only ever present when the database already decided to release it.
 */
export async function AppointmentPanel({
  locale,
  requestId,
  appointment,
  events = [],
  viewerTimezone,
  audience,
  showHistory = false,
}: {
  locale: AppLocale;
  requestId: string;
  appointment: SupportAppointment;
  events?: AppointmentEvent[];
  viewerTimezone?: string | null;
  audience: "household" | "specialist" | "administrator";
  showHistory?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "appointments" });
  const inConfirmedZone = formatAppointmentInZone(appointment.start_time, appointment.timezone, locale);
  const showViewerZone =
    Boolean(viewerTimezone) &&
    isSupportedTimezone(viewerTimezone as string) &&
    viewerTimezone !== appointment.timezone;

  return (
    <section
      aria-label={t("appointment")}
      className="space-y-4 rounded-2xl border border-border bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-bold">{t("appointment")}</h2>
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            statusStyles[appointment.status] ?? "bg-secondary"
          }`}
        >
          {t(`statuses.${appointment.status}`)}
        </span>
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("dateAndTime")}:</dt>
          <dd className="break-words [overflow-wrap:anywhere]">{inConfirmedZone}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("timezone")}:</dt>
          <dd>{appointment.timezone}</dd>
        </div>
        {showViewerZone ? (
          <div className="flex flex-wrap gap-1.5">
            <dt className="font-semibold">{t("yourTimezone")}:</dt>
            <dd className="break-words [overflow-wrap:anywhere]">
              {formatAppointmentInZone(appointment.start_time, viewerTimezone as string, locale)}
            </dd>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("duration")}:</dt>
          <dd>{t("durationMinutes", { count: appointment.duration_minutes })}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("meetingMethod")}:</dt>
          <dd>{t(`modalities.${appointment.modality}`)}</dd>
        </div>
        {audience !== "administrator" ? (
          <div className="flex flex-wrap gap-1.5">
            <dt className="font-semibold">{t("specialist")}:</dt>
            <dd className="break-words [overflow-wrap:anywhere]">{appointment.specialist_name}</dd>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("consent")}:</dt>
          <dd>{appointment.consented_at ? t("consentRecorded") : t("consentPending")}</dd>
        </div>
        {appointment.cancellation_reason ? (
          <div className="flex flex-wrap gap-1.5">
            <dt className="font-semibold">{t("cancellationReason")}:</dt>
            <dd>{t(`cancellationReasons.${appointment.cancellation_reason}`)}</dd>
          </div>
        ) : null}
      </dl>

      {appointment.meeting_url ? (
        <p className="text-sm">
          <span className="font-semibold">{t("meetingLink")}: </span>
          <a
            className="break-all underline [overflow-wrap:anywhere]"
            href={appointment.meeting_url}
            rel="noreferrer noopener"
            target="_blank"
          >
            {appointment.meeting_url}
          </a>
        </p>
      ) : appointment.modality === "video" && appointment.status === "proposed" ? (
        <p className="text-sm text-muted-foreground">{t("meetingLinkAfterConsent")}</p>
      ) : null}

      {audience === "household" && appointment.can_accept ? (
        <AppointmentConsentForm
          appointmentId={appointment.id}
          locale={locale}
          requestId={requestId}
          version={appointment.version}
        />
      ) : null}

      {audience === "administrator" ? (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold" role="note">
          {t("administratorReadOnlyNotice")}
        </p>
      ) : (
        <AppointmentLifecycleControls
          appointmentId={appointment.id}
          canCancel={appointment.can_cancel}
          canComplete={appointment.can_complete}
          locale={locale}
          requestId={requestId}
          showRescheduleRequest={audience === "household" && appointment.status === "scheduled"}
          version={appointment.version}
        />
      )}

      {showHistory && events.length > 0 ? (
        <section aria-label={t("history")}>
          <h3 className="text-base font-bold">{t("history")}</h3>
          <ol className="mt-2 grid gap-2">
            {events.map((event) => (
              <li className="rounded-lg border border-border p-3 text-sm" key={event.id}>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                    {t(`actions.${event.action}`)}
                  </span>
                  <span className="text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(event.created_at))}
                  </span>
                </p>
                {event.reason ? (
                  <p className="mt-1 text-muted-foreground">{t(`cancellationReasons.${event.reason}`)}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
