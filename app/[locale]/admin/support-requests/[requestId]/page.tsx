import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { AppointmentPanel } from "@/components/appointments/appointment-panel";
import { SupportMessageList } from "@/components/support/support-message-list";
import { SpecialistAssignmentControls } from "@/components/specialists/specialist-assignment-controls";
import { supportRequestIdSchema } from "@/lib/validation/support";
import { getAdminSupportRequest, getSupportRequestMessages } from "@/lib/support/server";
import {
  getSupportRequestAssignment,
  listAssignableSpecialists,
  listSupportRequestAssignmentEvents,
} from "@/lib/specialists/server";
import {
  findDisplayAppointment,
  getSupportAppointments,
  listAppointmentEvents,
} from "@/lib/appointments/server";

export const dynamic = "force-dynamic";

function formatDateTime(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AdminSupportRequestPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; requestId: string }> }>) {
  const { locale: localeParam, requestId } = await params;
  const locale = localeParam as AppLocale;
  if (!supportRequestIdSchema.safeParse(requestId).success) notFound();
  const [t, specialistTranslations, request] = await Promise.all([
    getTranslations({ locale, namespace: "support" }),
    getTranslations({ locale, namespace: "specialists" }),
    getAdminSupportRequest(requestId),
  ]);
  if (!request) notFound();
  const [messages, assignment, assignmentEvents, specialists, appointments, appointmentTranslations] =
    await Promise.all([
      getSupportRequestMessages(requestId),
      getSupportRequestAssignment(requestId),
      listSupportRequestAssignmentEvents(requestId),
      listAssignableSpecialists(),
      getSupportAppointments(requestId),
      getTranslations({ locale, namespace: "appointments" }),
    ]);
  const displayAppointment = findDisplayAppointment(appointments);
  // Administrators observe the appointment and its history but never act on it.
  const appointmentEvents = displayAppointment ? await listAppointmentEvents(displayAppointment.id) : [];

  return (
    <section className="max-w-3xl space-y-6">
      <div>
        <Link className="text-sm font-semibold underline" href="/admin/support-requests">
          {t("backToTriage")}
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-3xl font-bold [overflow-wrap:anywhere]">
            {request.subject}
          </h1>
          <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">
            {t(`statuses.${request.status}`)}
          </span>
        </div>
      </div>
      <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-6" role="note">
        {t("adminReadOnlyNotice")} {specialistTranslations("administratorScopeNotice")}
      </p>
      <dl className="grid gap-x-6 gap-y-2 rounded-2xl border border-border bg-white p-5 text-sm sm:grid-cols-2">
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("household")}:</dt>
          <dd className="break-words [overflow-wrap:anywhere]">{request.household_label}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("category")}:</dt>
          <dd>{t(`categories.${request.category}`)}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("preferredLanguage")}:</dt>
          <dd>{t(`languages.${request.preferred_language}`)}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("created")}:</dt>
          <dd>{formatDateTime(request.created_at, locale)}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{specialistTranslations("assignedSpecialist")}:</dt>
          <dd className="break-words [overflow-wrap:anywhere]">
            {assignment?.specialist_name ?? specialistTranslations("noSpecialistAssigned")}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{specialistTranslations("assignmentVersion")}:</dt>
          <dd>{assignment?.assignment_version ?? 0}</dd>
        </div>
      </dl>

      <section aria-label={specialistTranslations("specialistAssignment")} className="space-y-3">
        <h2 className="text-xl font-bold">{specialistTranslations("specialistAssignment")}</h2>
        {assignment === null ? (
          <p className="text-muted-foreground" role="alert">
            {specialistTranslations("loadAssignmentError")}
          </p>
        ) : assignment.can_assign || assignment.can_revoke ? (
          <SpecialistAssignmentControls
            assignmentVersion={assignment.assignment_version}
            canAssign={assignment.can_assign}
            canRevoke={assignment.can_revoke}
            locale={locale}
            requestId={request.id}
            specialists={(specialists ?? []).map((specialist) => ({
              id: specialist.id,
              label: specialist.display_name,
              isEligible: specialist.is_eligible,
              activeAssignmentCount: specialist.active_assignment_count,
            }))}
          />
        ) : (
          <p className="text-muted-foreground" role="status">
            {specialistTranslations("assignmentUnavailableForStatus")}
          </p>
        )}
      </section>

      <section aria-label={specialistTranslations("assignmentHistory")}>
        <h2 className="text-xl font-bold">{specialistTranslations("assignmentHistory")}</h2>
        {assignmentEvents.length === 0 ? (
          <p className="mt-3 text-muted-foreground">{specialistTranslations("noAssignmentHistory")}</p>
        ) : (
          <ol className="mt-3 grid gap-2">
            {assignmentEvents.map((event) => (
              <li className="rounded-xl border border-border bg-white p-4 text-sm" key={event.id}>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                    {specialistTranslations(`actions.${event.action}`)}
                  </span>
                  <span className="font-semibold break-words [overflow-wrap:anywhere]">
                    {event.specialist_name}
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(event.created_at, locale)}</span>
                </p>
                {event.reason ? (
                  <p className="mt-1 text-muted-foreground">
                    {specialistTranslations(`reasons.${event.reason}`)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {displayAppointment ? (
        <AppointmentPanel
          appointment={displayAppointment}
          audience="administrator"
          events={appointmentEvents}
          locale={locale}
          requestId={request.id}
          showHistory
        />
      ) : (
        <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-6">
          {appointmentTranslations("noAppointmentProposed")}
        </p>
      )}

      <section aria-label={t("messagesTitle")}>
        <h2 className="text-xl font-bold">{t("messagesTitle")}</h2>
        <SupportMessageList locale={locale} messages={messages} showSelfAttribution={false} />
      </section>
    </section>
  );
}
