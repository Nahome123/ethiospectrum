import { CalendarClock, Download, FileText, MapPin, Video } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { RequestDocumentUpload } from "@/components/services/request-document-upload";
import { SlotFields } from "@/components/services/slot-fields";
import {
  AppointmentStatusBadge,
  PaymentStatusBadge,
  ServiceStatusBadge,
  StatusPill,
} from "@/components/services/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/i18n/routing";
import {
  addServiceMessageAction,
  confirmAppointmentAction,
  requestOtherTimesAction,
  requestRescheduleAction,
} from "@/lib/services/actions";
import {
  MESSAGE_MAX,
  canRescheduleConfirmed,
  formatCents,
  isClosedStatus,
  serviceLifecycle,
  type ServiceStatus,
} from "@/lib/services/constants";
import { formatDateTime, formatShortDateTime, localizedInstruction } from "@/lib/services/display";
import type { ServiceAppointment, ServiceRequestBundle } from "@/lib/services/server";
import {
  cancelAppointmentAction,
  modifyAppointmentAction,
  recordOutcomeAction,
  updateActivityAction,
} from "@/lib/services/staff-actions";
import { activityStatusValues } from "@/lib/services/constants";

export type RequestAudience = "household" | "specialist" | "administrator";

type Props = {
  bundle: ServiceRequestBundle;
  locale: AppLocale;
  audience: RequestAudience;
  /** Audience-specific action panel rendered beneath the summary. */
  panel?: React.ReactNode;
};

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold" id={id}>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-sm font-semibold">{label}</dt>
      <dd className="mt-1 whitespace-pre-line break-words text-sm text-muted-foreground">{value}</dd>
    </div>
  );
}

export async function RequestDetailView({ bundle, locale, audience, panel }: Props) {
  const { request, appointments, activities, documents, payments, refunds, timeline } = bundle;
  const t = await getTranslations({ locale, namespace: "services.detail" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const statusHelp = await getTranslations({ locale, namespace: "services.statusHelp" });
  const statuses = await getTranslations({ locale, namespace: "services.status" });
  const languages = await getTranslations({ locale, namespace: "services.languages" });
  const iepLanguages = await getTranslations({ locale, namespace: "services.iepLanguages" });
  const delivery = await getTranslations({ locale, namespace: "services.deliveryMethods" });
  const locations = await getTranslations({ locale, namespace: "services.locations" });
  const categories = await getTranslations({ locale, namespace: "services.categories" });
  const followUp = await getTranslations({ locale, namespace: "services.followUpStatus" });
  const activityLabels = await getTranslations({ locale, namespace: "services.activities" });
  const activityStatus = await getTranslations({ locale, namespace: "services.activityStatus" });
  const events = await getTranslations({ locale, namespace: "services.events" });
  const policy = await getTranslations({ locale, namespace: "services.policy" });
  const tiers = await getTranslations({ locale, namespace: "services.refundTiers" });

  const status = request.status as ServiceStatus;
  const closed = isClosedStatus(status);
  const isStaff = audience !== "household";
  const standardInstruction = localizedInstruction(request.standard_instructions, locale);
  const lifecycleIndex = serviceLifecycle.indexOf(status);
  const visibleAppointments = appointments.filter(
    (appointment) => appointment.status !== "superseded" && appointment.status !== "declined",
  );
  const proposed = visibleAppointments.filter((appointment) => appointment.status === "proposed");
  const now = new Date();

  const renderAppointment = (appointment: ServiceAppointment) => {
    const started = new Date(appointment.start_at) <= now;
    const canReschedule =
      audience === "household" &&
      request.can_confirm &&
      appointment.status === "confirmed" &&
      canRescheduleConfirmed({
        confirmedStartAt: appointment.start_at,
        lateRescheduleUsed: request.late_reschedule_used,
        now,
      });
    const confirmBlockedByPayment =
      appointment.kind === "primary" &&
      request.payment_status !== "paid" &&
      appointment.status === "proposed";
    return (
      <li className="rounded-xl border p-4" key={appointment.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-semibold">
              <CalendarClock aria-hidden="true" className="size-4 text-primary" />
              {formatDateTime(appointment.start_at, locale, appointment.timezone)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("duration", {
                minutes: Math.round(
                  (new Date(appointment.end_at).getTime() - new Date(appointment.start_at).getTime()) / 60000,
                ),
              })}{" "}
              · {appointment.kind === "follow_up" ? t("followUpSession") : t("primarySession")} ·{" "}
              {appointment.specialist_name}
            </p>
            <p className="flex items-center gap-2 text-sm">
              {appointment.delivery_method === "remote" ? (
                <Video aria-hidden="true" className="size-4" />
              ) : (
                <MapPin aria-hidden="true" className="size-4" />
              )}
              {locations(appointment.location_type)}
              {appointment.location_details ? ` — ${appointment.location_details}` : ""}
            </p>
            {appointment.meeting_url ? (
              <a
                className="text-sm font-semibold text-primary underline"
                href={appointment.meeting_url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("joinMeeting")}
              </a>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <AppointmentStatusBadge status={appointment.status} />
            {appointment.status === "confirmed" ? (
              <StatusPill
                label={
                  appointment.customer_confirmed ? t("confirmedByHousehold") : t("scheduledByEthiospectrum")
                }
                tone="info"
              />
            ) : null}
          </div>
        </div>
        {standardInstruction || appointment.instructions ? (
          <div className="mt-3 space-y-1 rounded-lg bg-secondary/40 p-3 text-sm">
            {standardInstruction ? <p>{standardInstruction}</p> : null}
            {appointment.instructions ? <p className="font-medium">{appointment.instructions}</p> : null}
          </div>
        ) : null}
        {appointment.cancellation_reason && appointment.status === "cancelled" ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("cancellationReason")}: {appointment.cancellation_reason}
          </p>
        ) : null}
        {isStaff && appointment.completion_notes ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("sessionNotes")}: {appointment.completion_notes}
          </p>
        ) : null}

        {audience === "household" && appointment.status === "proposed" && request.can_confirm ? (
          confirmBlockedByPayment ? (
            <p className="mt-3 text-sm font-medium text-amber-800">{t("payToConfirm")}</p>
          ) : (
            <ActionForm
              action={confirmAppointmentAction.bind(null, locale, request.id)}
              className="mt-3"
              pendingLabel={t("confirming")}
              submitLabel={t("confirmThisTime")}
            >
              <input name="appointmentId" type="hidden" value={appointment.id} />
            </ActionForm>
          )
        ) : null}

        {canReschedule ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold underline">{t("reschedule")}</summary>
            <ActionForm
              action={requestRescheduleAction.bind(null, locale, request.id)}
              className="mt-3"
              confirmMessage={t("rescheduleConfirm")}
              pendingLabel={t("sending")}
              submitLabel={t("requestReschedule")}
              variant="outline"
            >
              <p className="text-sm text-muted-foreground">{policy("rescheduleRule")}</p>
              <Label htmlFor={`reschedule-${appointment.id}`}>{t("reasonOptional")}</Label>
              <Textarea id={`reschedule-${appointment.id}`} maxLength={1000} name="reason" rows={2} />
            </ActionForm>
          </details>
        ) : null}

        {isStaff && appointment.status === "confirmed" ? (
          <div className="mt-3 flex flex-wrap gap-4">
            {started ? (
              <details>
                <summary className="cursor-pointer text-sm font-semibold underline">
                  {t("recordOutcome")}
                </summary>
                <ActionForm
                  action={recordOutcomeAction.bind(null, locale, request.id)}
                  className="mt-3"
                  pendingLabel={t("saving")}
                  submitLabel={t("saveOutcome")}
                >
                  <input name="appointmentId" type="hidden" value={appointment.id} />
                  <fieldset className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input defaultChecked name="outcome" type="radio" value="completed" />
                      {t("outcomeHeld")}
                    </label>
                    <label className="flex items-center gap-2">
                      <input name="outcome" type="radio" value="no_show" />
                      {t("outcomeNoShow")}
                    </label>
                  </fieldset>
                  <Label htmlFor={`notes-${appointment.id}`}>{t("sessionNotes")}</Label>
                  <Textarea id={`notes-${appointment.id}`} maxLength={3000} name="notes" rows={3} />
                </ActionForm>
              </details>
            ) : (
              <p className="text-sm text-muted-foreground">{t("outcomeAfterStart")}</p>
            )}
          </div>
        ) : null}

        {audience === "administrator" &&
        (appointment.status === "confirmed" || appointment.status === "proposed") &&
        !started ? (
          <div className="mt-3 flex flex-wrap gap-6">
            <details>
              <summary className="cursor-pointer text-sm font-semibold underline">
                {t("modifyAppointment")}
              </summary>
              <ActionForm
                action={modifyAppointmentAction.bind(null, locale, request.id)}
                className="mt-3 max-w-xl"
                pendingLabel={t("saving")}
                submitLabel={t("saveChanges")}
              >
                <input name="appointmentId" type="hidden" value={appointment.id} />
                <SlotFields
                  defaults={{
                    timezone: appointment.timezone,
                    locationType: appointment.location_type,
                    locationDetails: appointment.location_details,
                    meetingUrl: appointment.meeting_url,
                    instructions: appointment.instructions,
                  }}
                  deliveryMethod={appointment.delivery_method as "remote" | "in_person"}
                  idPrefix={`modify-${appointment.id}`}
                  maxSlots={1}
                />
              </ActionForm>
            </details>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-destructive underline">
                {t("cancelAppointment")}
              </summary>
              <ActionForm
                action={cancelAppointmentAction.bind(null, locale, request.id)}
                className="mt-3 max-w-xl"
                confirmMessage={t("adminCancelConfirm")}
                pendingLabel={t("saving")}
                submitLabel={t("cancelAppointment")}
                variant="destructive"
              >
                <input name="appointmentId" type="hidden" value={appointment.id} />
                <p className="text-sm text-muted-foreground">{t("adminCancelHelp")}</p>
                <Label htmlFor={`cancel-${appointment.id}`}>{t("reason")}</Label>
                <Textarea id={`cancel-${appointment.id}`} maxLength={1000} name="reason" required rows={2} />
              </ActionForm>
            </details>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-sm font-semibold text-primary">
          {types(request.service_type)} · {request.dependent_name}
          {isStaff ? ` · ${request.household_name}` : ""}
        </p>
        <h1 className="text-3xl font-bold">{t("title", { service: types(request.service_type) })}</h1>
        <div className="flex flex-wrap gap-2">
          <ServiceStatusBadge status={request.status} />
          <PaymentStatusBadge status={request.payment_status} />
          <AppointmentStatusBadge status={request.appointment_status} />
        </div>
        <p className="max-w-3xl text-muted-foreground" role="status">
          {statusHelp(request.status)}
        </p>
      </header>

      {lifecycleIndex >= 0 ? (
        <ol aria-label={t("progress")} className="flex flex-wrap gap-x-2 gap-y-2 text-xs">
          {serviceLifecycle.map((step, index) => (
            <li
              aria-current={index === lifecycleIndex ? "step" : undefined}
              className={
                index < lifecycleIndex
                  ? "rounded-full bg-primary/15 px-3 py-1 font-medium text-primary"
                  : index === lifecycleIndex
                    ? "rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground"
                    : "rounded-full bg-secondary px-3 py-1 text-muted-foreground"
              }
              key={step}
            >
              {statuses(step)}
            </li>
          ))}
        </ol>
      ) : null}

      {panel}

      <Section id="appointments-heading" title={t("appointments")}>
        {visibleAppointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noAppointments")}</p>
        ) : (
          <ul className="space-y-3">{visibleAppointments.map(renderAppointment)}</ul>
        )}
        {audience === "household" && proposed.length > 0 && request.can_confirm ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold underline">
              {t("noneOfTheseWork")}
            </summary>
            <ActionForm
              action={requestOtherTimesAction.bind(null, locale, request.id)}
              className="mt-3"
              pendingLabel={t("sending")}
              submitLabel={t("requestOtherTimes")}
              variant="outline"
            >
              <Label htmlFor="other-times-note">{t("availabilityNote")}</Label>
              <Textarea id="other-times-note" maxLength={1000} name="note" rows={2} />
            </ActionForm>
          </details>
        ) : null}
        <div className="mt-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">{policy("title")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>{policy("moreThan48")}</li>
            <li>{policy("between24And48")}</li>
            <li>{policy("lessThan24")}</li>
            <li>{policy("noShow")}</li>
            <li>{policy("administrative")}</li>
          </ul>
        </div>
      </Section>

      <Section id="request-details-heading" title={t("requestDetails")}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label={t("child")} value={request.dependent_name} />
          <Detail label={t("requestedBy")} value={request.requester_name} />
          <Detail label={t("submitted")} value={formatShortDateTime(request.created_at, locale)} />
          <Detail label={t("specialist")} value={request.specialist_name ?? t("notAssigned")} />
          <Detail
            label={t("language")}
            value={
              request.service_type === "iep_language_assistance" && request.iep_language
                ? iepLanguages(request.iep_language)
                : languages(request.preferred_language)
            }
          />
          <Detail label={t("delivery")} value={delivery(request.delivery_method)} />
          {request.consultation_category ? (
            <Detail label={t("category")} value={categories(request.consultation_category)} />
          ) : null}
          {request.preferred_location_type ? (
            <Detail
              label={t("preferredLocation")}
              value={`${locations(request.preferred_location_type)}${request.preferred_location_details ? ` — ${request.preferred_location_details}` : ""}`}
            />
          ) : null}
          {request.requested_meeting_date ? (
            <Detail label={t("meetingDate")} value={request.requested_meeting_date} />
          ) : null}
          <Detail label={t("followUp")} value={followUp(request.follow_up_status)} />
          <div className="sm:col-span-2">
            <Detail label={t("description")} value={request.description} />
          </div>
          <div className="sm:col-span-2">
            <Detail label={t("relevantInformation")} value={request.relevant_information} />
          </div>
          {request.completion_notes ? (
            <div className="sm:col-span-2">
              <Detail label={t("completionNotes")} value={request.completion_notes} />
            </div>
          ) : null}
          {request.cancellation_reason ? (
            <div className="sm:col-span-2">
              <Detail label={t("cancellationReason")} value={request.cancellation_reason} />
            </div>
          ) : null}
          {request.declined_reason ? (
            <div className="sm:col-span-2">
              <Detail label={t("declinedReason")} value={request.declined_reason} />
            </div>
          ) : null}
        </dl>
        {isStaff ? (
          <div className="mt-6 rounded-xl bg-secondary/40 p-4">
            <h3 className="font-semibold">{t("serviceDeliveryInformation")}</h3>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              <Detail label={t("serviceNeeds")} value={request.dependent_service_needs} />
              <Detail label={t("communication")} value={request.dependent_communication} />
              <Detail
                label={t("childLanguage")}
                value={
                  request.dependent_preferred_language
                    ? languages(request.dependent_preferred_language)
                    : null
                }
              />
              <Detail label={t("educationalInformation")} value={request.dependent_educational_information} />
              <Detail label={t("behavioralInformation")} value={request.dependent_behavioral_information} />
              <Detail label={t("householdPhone")} value={request.household_contact_phone} />
              <Detail label={t("householdEmail")} value={request.household_contact_email} />
            </dl>
          </div>
        ) : null}
      </Section>

      {activities.length > 0 ? (
        <Section id="activities-heading" title={t("serviceActivities")}>
          <ul className="space-y-3">
            {activities.map((activity) => (
              <li className="rounded-xl border p-4" key={activity.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{activityLabels(activity.activity_type)}</p>
                  <StatusPill
                    label={activityStatus(activity.status)}
                    tone={
                      activity.status === "completed"
                        ? "success"
                        : activity.status === "in_progress"
                          ? "info"
                          : "neutral"
                    }
                  />
                </div>
                {activity.notes ? (
                  <p className="mt-2 text-sm text-muted-foreground">{activity.notes}</p>
                ) : null}
                {isStaff && !closed ? (
                  <ActionForm
                    action={updateActivityAction.bind(null, locale, request.id)}
                    className="mt-3 flex flex-wrap items-end gap-3 space-y-0"
                    inline
                    pendingLabel={t("saving")}
                    size="sm"
                    submitLabel={t("updateActivity")}
                    variant="outline"
                  >
                    <input name="activityId" type="hidden" value={activity.id} />
                    <label className="text-sm" htmlFor={`activity-${activity.id}`}>
                      <span className="sr-only">{t("activityStatus")}</span>
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        defaultValue={activity.status}
                        id={`activity-${activity.id}`}
                        name="status"
                      >
                        {activityStatusValues.map((value) => (
                          <option key={value} value={value}>
                            {activityStatus(value)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      aria-label={t("activityNotes")}
                      className="h-8 w-56"
                      maxLength={2000}
                      name="notes"
                      placeholder={t("activityNotes")}
                    />
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section id="documents-heading" title={t("documents")}>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noDocuments")}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {documents.map((document) => (
              <li className="flex flex-wrap items-center justify-between gap-3 p-3" key={document.id}>
                <div className="flex min-w-0 items-center gap-2">
                  <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{document.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {document.uploaded_by_staff ? t("fromSpecialist") : t("fromHousehold")} ·{" "}
                      {document.uploaded_by_name} · {formatShortDateTime(document.created_at, locale)}
                    </p>
                  </div>
                </div>
                <a
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline"
                  href={`/api/service-requests/${request.id}/documents/${document.id}`}
                >
                  <Download aria-hidden="true" className="size-4" />
                  {t("download")}
                </a>
              </li>
            ))}
          </ul>
        )}
        {request.can_upload && !closed ? (
          <div className="mt-4 border-t pt-4">
            <h3 className="mb-3 text-sm font-semibold">
              {audience === "specialist" ? t("uploadDeliverable") : t("uploadDocument")}
            </h3>
            <RequestDocumentUpload locale={locale} requestId={request.id} />
          </div>
        ) : null}
      </Section>

      {audience !== "specialist" && (payments.length > 0 || refunds.length > 0) ? (
        <Section id="payments-heading" title={t("payments")}>
          <ul className="space-y-2">
            {payments.map((payment) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
                key={payment.id}
              >
                <div>
                  <p className="font-semibold">{formatCents(payment.amount_total_cents, locale)}</p>
                  <p className="text-muted-foreground">
                    {formatShortDateTime(payment.paid_at ?? payment.created_at, locale)}
                    {payment.tax_amount_cents
                      ? ` · ${t("taxIncluded", { tax: formatCents(payment.tax_amount_cents, locale) })}`
                      : ""}
                    {payment.refunded_amount_cents
                      ? ` · ${t("refundedAmount", { amount: formatCents(payment.refunded_amount_cents, locale) })}`
                      : ""}
                  </p>
                </div>
                <PaymentStatusBadge status={payment.status} />
              </li>
            ))}
            {refunds.map((refund) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-3 text-sm"
                key={refund.id}
              >
                <div>
                  <p className="font-semibold">
                    {t("refund")}:{" "}
                    {formatCents(refund.refund_amount_cents ?? refund.eligible_amount_cents, locale)}
                  </p>
                  <p className="text-muted-foreground">
                    {tiers(refund.policy_tier)} ·{" "}
                    {formatShortDateTime(refund.processed_at ?? refund.created_at, locale)}
                  </p>
                </div>
                <PaymentStatusBadge status={refund.status} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section id="timeline-heading" title={t("activityAndMessages")}>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
        ) : (
          <ol className="space-y-3">
            {timeline.map((item) => (
              <li
                className={
                  item.item_type === "message"
                    ? `rounded-xl border p-3 ${item.is_self ? "border-primary/30 bg-primary/5" : "bg-white"}`
                    : "flex flex-wrap gap-x-2 text-sm text-muted-foreground"
                }
                key={`${item.item_type}-${item.id}`}
              >
                {item.item_type === "message" ? (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {item.actor_name ?? t(`authors.${item.actor_kind}`)} · {t(`authors.${item.actor_kind}`)}{" "}
                      · {formatShortDateTime(item.created_at, locale)}
                    </p>
                    <p className="mt-1 whitespace-pre-line break-words text-sm">{item.body}</p>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {events.has(item.action) ? events(item.action) : events("generic")}
                    </span>
                    <span>
                      ·{" "}
                      {item.actor_kind === "system"
                        ? t("authors.system")
                        : (item.actor_name ?? t(`authors.${item.actor_kind}`))}{" "}
                      · {formatShortDateTime(item.created_at, locale)}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
        {(audience !== "household" || request.can_manage) && request.status !== "declined" ? (
          <ActionForm
            action={addServiceMessageAction.bind(null, locale, request.id)}
            className="mt-4"
            pendingLabel={t("sending")}
            resetOnSuccess
            submitLabel={t("sendMessage")}
          >
            <Label htmlFor="service-message">{t("message")}</Label>
            <Textarea id="service-message" maxLength={MESSAGE_MAX} name="body" required rows={3} />
            <p className="text-xs text-muted-foreground">{t("messageNotice")}</p>
          </ActionForm>
        ) : null}
      </Section>
    </div>
  );
}
