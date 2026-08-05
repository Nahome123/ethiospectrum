import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { AppointmentPanel } from "@/components/appointments/appointment-panel";
import { AppointmentProposalForm } from "@/components/appointments/appointment-proposal-form";
import { SpecialistResponseForm } from "@/components/specialists/specialist-response-form";
import { SupportMessageList } from "@/components/support/support-message-list";
import { getSpecialistSupportRequest } from "@/lib/specialists/server";
import { getSupportRequestMessages } from "@/lib/support/server";
import {
  findDisplayAppointment,
  findLiveAppointment,
  getSupportAppointments,
} from "@/lib/appointments/server";
import { getCurrentMemberProfile, getCurrentSupabaseClaims } from "@/lib/supabase/server";
import { specialistRequestIdSchema } from "@/lib/validation/specialists";

export const dynamic = "force-dynamic";

function formatDateTime(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function SpecialistSupportRequestPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; requestId: string }> }>) {
  const { locale: localeParam, requestId } = await params;
  const locale = localeParam as AppLocale;
  if (!specialistRequestIdSchema.safeParse(requestId).success) notFound();
  const [t, supportTranslations, request] = await Promise.all([
    getTranslations({ locale, namespace: "specialists" }),
    getTranslations({ locale, namespace: "support" }),
    getSpecialistSupportRequest(requestId),
  ]);

  // A revoked, closed, or unrelated request resolves to the same safe state, so
  // the page never reveals whether the request exists.
  if (!request) {
    return (
      <section className="mx-auto max-w-3xl">
        <Link className="text-sm font-semibold underline" href="/specialist/support-requests">
          {t("backToWorkload")}
        </Link>
        <h1 className="mt-4 text-3xl font-bold">{t("accessRemoved")}</h1>
        <p className="mt-3 text-muted-foreground" role="status">
          {t("accessRemovedDescription")}
        </p>
      </section>
    );
  }

  const [messages, appointments, appointmentTranslations, claims] = await Promise.all([
    getSupportRequestMessages(requestId),
    getSupportAppointments(requestId),
    getTranslations({ locale, namespace: "appointments" }),
    getCurrentSupabaseClaims(),
  ]);
  const liveAppointment = findLiveAppointment(appointments);
  const displayAppointment = findDisplayAppointment(appointments);
  const specialistProfile =
    claims && typeof claims.sub === "string" ? await getCurrentMemberProfile(claims.sub) : null;
  const proposalTimezone = specialistProfile?.timezone || "UTC";

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link className="text-sm font-semibold underline" href="/specialist/support-requests">
          {t("backToWorkload")}
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-3xl font-bold [overflow-wrap:anywhere]">
            {request.subject}
          </h1>
          <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {supportTranslations(`statuses.${request.status}`)}
          </span>
        </div>
      </div>

      <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-6" role="note">
        {t("householdControlsLifecycle")}
      </p>

      <dl className="grid gap-x-6 gap-y-2 rounded-2xl border border-border bg-white p-5 text-sm sm:grid-cols-2">
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{supportTranslations("category")}:</dt>
          <dd>{supportTranslations(`categories.${request.category}`)}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{supportTranslations("preferredLanguage")}:</dt>
          <dd>{supportTranslations(`languages.${request.preferred_language}`)}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{supportTranslations("requestedBy")}:</dt>
          <dd className="break-words [overflow-wrap:anywhere]">{request.requester_name}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{supportTranslations("created")}:</dt>
          <dd>{formatDateTime(request.created_at, locale)}</dd>
        </div>
      </dl>

      {displayAppointment ? (
        <AppointmentPanel
          appointment={displayAppointment}
          audience="specialist"
          locale={locale}
          requestId={request.id}
          viewerTimezone={specialistProfile?.timezone ?? null}
        />
      ) : null}

      {liveAppointment ? null : (
        <section
          aria-label={appointmentTranslations("proposeAppointment")}
          className="space-y-4 rounded-2xl border border-border bg-white p-5"
        >
          <h2 className="text-xl font-bold">{appointmentTranslations("proposeAppointment")}</h2>
          <p className="text-sm text-muted-foreground">{appointmentTranslations("proposalHelp")}</p>
          <AppointmentProposalForm
            defaultTimezone={proposalTimezone}
            locale={locale}
            requestId={request.id}
            supersedesAppointmentId={displayAppointment?.id}
          />
        </section>
      )}

      <section aria-label={supportTranslations("messagesTitle")}>
        <h2 className="text-xl font-bold">{supportTranslations("messagesTitle")}</h2>
        <SupportMessageList locale={locale} messages={messages} showSelfAttribution={false} />
      </section>

      <SpecialistResponseForm locale={locale} requestId={request.id} />
    </section>
  );
}
