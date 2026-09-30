import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { SlotFields } from "@/components/services/slot-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/i18n/routing";
import { formatCents, overridableStatusValues } from "@/lib/services/constants";
import {
  createRefundExceptionAction,
  processRefundAction,
  rejectRefundAction,
} from "@/lib/services/payment-actions";
import type { MatchingSpecialist, ServiceRequestBundle } from "@/lib/services/server";
import {
  adminCancelRequestAction,
  assignSpecialistAction,
  completeServiceAction,
  declineRequestAction,
  overrideStatusAction,
  proposeAppointmentsAction,
  requestAvailabilityAction,
  scheduleAppointmentAction,
} from "@/lib/services/staff-actions";

const primaryProposalStatuses = [
  "assigned",
  "awaiting_availability",
  "awaiting_payment",
  "payment_failed",
  "appointment_proposed",
  "reschedule_requested",
];

function Card({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h3 className="font-bold">{title}</h3>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function schedulingKinds(bundle: ServiceRequestBundle): ("primary" | "follow_up")[] {
  const { request, appointments } = bundle;
  const kinds: ("primary" | "follow_up")[] = [];
  const hasConfirmedPrimary = appointments.some(
    (item) => item.kind === "primary" && item.status === "confirmed",
  );
  if (request.specialist_id && primaryProposalStatuses.includes(request.status) && !hasConfirmedPrimary)
    kinds.push("primary");
  if (
    request.specialist_id &&
    ["available", "requested"].includes(request.follow_up_status) &&
    request.status !== "completed"
  ) {
    kinds.push("follow_up");
  }
  return kinds;
}

async function ProposeCard({
  bundle,
  locale,
  kinds,
  audience,
}: {
  bundle: ServiceRequestBundle;
  locale: AppLocale;
  kinds: ("primary" | "follow_up")[];
  audience: "administrator" | "specialist";
}) {
  const t = await getTranslations({ locale, namespace: "services.staff" });
  const { request } = bundle;
  return (
    <Card description={t("proposeHelp")} title={t("proposeTimes")}>
      <ActionForm
        action={proposeAppointmentsAction.bind(null, locale, request.id)}
        pendingLabel={t("saving")}
        submitLabel={t("sendProposal")}
      >
        <input name="expectedVersion" type="hidden" value={request.version} />
        <KindPicker kinds={kinds} name={`${audience}-propose`} t={t} />
        <SlotFields
          deliveryMethod={request.delivery_method as "remote" | "in_person"}
          idPrefix={`${audience}-propose`}
          maxSlots={3}
        />
      </ActionForm>
    </Card>
  );
}

function KindPicker({
  kinds,
  name,
  t,
}: {
  kinds: ("primary" | "follow_up")[];
  name: string;
  t: (key: string) => string;
}) {
  if (kinds.length === 1) return <input name="kind" type="hidden" value={kinds[0]} />;
  return (
    <fieldset className="flex flex-wrap gap-4 text-sm">
      <legend className="sr-only">{t("appointmentKind")}</legend>
      {kinds.map((kind, index) => (
        <label className="flex items-center gap-2" key={`${name}-${kind}`}>
          <input defaultChecked={index === 0} name="kind" type="radio" value={kind} />
          {t(`kinds.${kind}`)}
        </label>
      ))}
    </fieldset>
  );
}

async function CompleteCard({ bundle, locale }: { bundle: ServiceRequestBundle; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "services.staff" });
  const { request } = bundle;
  if (request.status !== "in_progress") return null;
  const followUpOpen = request.follow_up_status === "requested" || request.follow_up_status === "scheduled";
  return (
    <Card
      description={followUpOpen ? t("completeBlockedByFollowUp") : t("completeHelp")}
      title={t("completeService")}
    >
      {followUpOpen ? null : (
        <ActionForm
          action={completeServiceAction.bind(null, locale, request.id)}
          confirmMessage={t("completeConfirm")}
          pendingLabel={t("saving")}
          submitLabel={t("markComplete")}
        >
          <input name="expectedVersion" type="hidden" value={request.version} />
          <Label htmlFor="completion-notes">{t("completionNotes")} *</Label>
          <Textarea id="completion-notes" maxLength={3000} minLength={2} name="notes" required rows={3} />
          {request.follow_up_status === "available" ? (
            <label className="flex items-start gap-2 text-sm">
              <input className="mt-1 size-4" name="waiveFollowUp" required type="checkbox" />
              <span>{t("waiveFollowUp")}</span>
            </label>
          ) : null}
        </ActionForm>
      )}
    </Card>
  );
}

export async function AdminRequestPanel({
  bundle,
  locale,
  specialists,
}: {
  bundle: ServiceRequestBundle;
  locale: AppLocale;
  specialists: MatchingSpecialist[];
}) {
  const t = await getTranslations({ locale, namespace: "services.staff" });
  const statuses = await getTranslations({ locale, namespace: "services.status" });
  const tiers = await getTranslations({ locale, namespace: "services.refundTiers" });
  const { request, refunds, payments } = bundle;
  const closed = ["completed", "cancelled", "declined"].includes(request.status);
  const canAssign = [
    "pending_review",
    "assigned",
    "awaiting_availability",
    "awaiting_payment",
    "payment_failed",
    "appointment_proposed",
    "reschedule_requested",
  ].includes(request.status);
  const kinds = schedulingKinds(bundle);
  const openRefunds = refunds.filter((refund) => refund.status === "requested" || refund.status === "failed");
  const refundablePayment = payments.find(
    (payment) => payment.status === "paid" || payment.status === "partially_refunded",
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {openRefunds.map((refund) => (
        <Card
          description={`${tiers(refund.policy_tier)} · ${refund.reason}`}
          key={refund.id}
          title={t("refundRequest", { amount: formatCents(refund.eligible_amount_cents, locale) })}
        >
          <ActionForm
            action={processRefundAction.bind(null, locale, refund.id)}
            confirmMessage={t("refundConfirm")}
            pendingLabel={t("processing")}
            submitLabel={t("processRefund")}
          >
            <Label htmlFor={`refund-amount-${refund.id}`}>{t("refundAmountCents")}</Label>
            <Input
              defaultValue={refund.eligible_amount_cents}
              id={`refund-amount-${refund.id}`}
              max={refund.eligible_amount_cents}
              min={1}
              name="amountCents"
              required
              type="number"
            />
            <p className="text-xs text-muted-foreground">{t("refundAmountHelp")}</p>
          </ActionForm>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold underline">{t("rejectRefund")}</summary>
            <ActionForm
              action={rejectRefundAction.bind(null, locale, refund.id)}
              className="mt-3"
              pendingLabel={t("saving")}
              submitLabel={t("rejectRefund")}
              variant="outline"
            >
              <Label htmlFor={`reject-${refund.id}`}>{t("reason")}</Label>
              <Textarea id={`reject-${refund.id}`} maxLength={500} name="reason" required rows={2} />
            </ActionForm>
          </details>
        </Card>
      ))}

      {canAssign ? (
        <Card
          description={t("assignHelp")}
          title={request.specialist_id ? t("reassignSpecialist") : t("assignSpecialist")}
        >
          {specialists.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSpecialists")}</p>
          ) : (
            <ActionForm
              action={assignSpecialistAction.bind(null, locale, request.id)}
              pendingLabel={t("saving")}
              submitLabel={request.specialist_id ? t("reassign") : t("assign")}
            >
              <input name="expectedVersion" type="hidden" value={request.version} />
              <fieldset className="space-y-2">
                <legend className="sr-only">{t("specialist")}</legend>
                {specialists.map((specialist, index) => (
                  <label className="flex items-start gap-2 text-sm" key={specialist.specialist_id}>
                    <input
                      className="mt-1"
                      defaultChecked={index === 0 && specialist.is_eligible}
                      disabled={!specialist.is_eligible}
                      name="specialistId"
                      required
                      type="radio"
                      value={specialist.specialist_id}
                    />
                    <span>
                      <span className="font-semibold">{specialist.display_name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {specialist.is_match ? t("matches") : t("noMatch")}
                        {specialist.availability_status !== "available"
                          ? ` · ${t("unavailable")}`
                          : ""} · {t("activeRequests", { count: Number(specialist.active_request_count) })}
                        {specialist.specialist_id === request.specialist_id ? ` · ${t("current")}` : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </ActionForm>
          )}
        </Card>
      ) : null}

      {request.specialist_id &&
      ["assigned", "reschedule_requested", "awaiting_payment", "payment_failed"].includes(request.status) ? (
        <Card description={t("availabilityHelp")} title={t("requestAvailability")}>
          <ActionForm
            action={requestAvailabilityAction.bind(null, locale, request.id)}
            pendingLabel={t("saving")}
            submitLabel={t("askSpecialist")}
            variant="outline"
          >
            <input name="expectedVersion" type="hidden" value={request.version} />
          </ActionForm>
        </Card>
      ) : null}

      {kinds.length > 0 ? (
        <ProposeCard audience="administrator" bundle={bundle} kinds={kinds} locale={locale} />
      ) : null}

      {kinds.length > 0 || (request.status === "no_show" && request.specialist_id) ? (
        <Card description={t("scheduleHelp")} title={t("scheduleDirectly")}>
          <ActionForm
            action={scheduleAppointmentAction.bind(null, locale, request.id)}
            pendingLabel={t("saving")}
            submitLabel={t("schedule")}
            variant="outline"
          >
            <input name="expectedVersion" type="hidden" value={request.version} />
            <KindPicker kinds={kinds.length ? kinds : ["primary"]} name="schedule" t={t} />
            <SlotFields
              deliveryMethod={request.delivery_method as "remote" | "in_person"}
              idPrefix="admin-schedule"
              maxSlots={1}
            />
          </ActionForm>
        </Card>
      ) : null}

      <CompleteCard bundle={bundle} locale={locale} />

      {refundablePayment ? (
        <Card description={t("exceptionHelp")} title={t("refundException")}>
          <ActionForm
            action={createRefundExceptionAction.bind(null, locale, refundablePayment.id)}
            pendingLabel={t("saving")}
            submitLabel={t("createException")}
            variant="outline"
          >
            <Label htmlFor="exception-amount">{t("refundAmountCents")}</Label>
            <Input
              id="exception-amount"
              max={refundablePayment.amount_total_cents - refundablePayment.refunded_amount_cents}
              min={1}
              name="amountCents"
              required
              type="number"
            />
            <Label htmlFor="exception-reason">{t("reason")}</Label>
            <Textarea id="exception-reason" maxLength={1000} name="reason" required rows={2} />
          </ActionForm>
        </Card>
      ) : null}

      {!closed ? (
        <Card title={t("moreActions")}>
          <div className="space-y-4">
            <details>
              <summary className="cursor-pointer text-sm font-semibold underline">
                {t("overrideStatus")}
              </summary>
              <ActionForm
                action={overrideStatusAction.bind(null, locale, request.id)}
                className="mt-3"
                pendingLabel={t("saving")}
                submitLabel={t("updateStatus")}
                variant="outline"
              >
                <Label htmlFor="override-status">{t("newStatus")}</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  defaultValue={request.status}
                  id="override-status"
                  name="status"
                >
                  {overridableStatusValues.map((value) => (
                    <option key={value} value={value}>
                      {statuses(value)}
                    </option>
                  ))}
                </select>
                <Label htmlFor="override-reason">{t("reason")}</Label>
                <Textarea id="override-reason" maxLength={500} name="reason" required rows={2} />
              </ActionForm>
            </details>
            {request.payment_status === "unpaid" || request.payment_status === "failed" ? (
              <details>
                <summary className="cursor-pointer text-sm font-semibold underline">
                  {t("declineRequest")}
                </summary>
                <ActionForm
                  action={declineRequestAction.bind(null, locale, request.id)}
                  className="mt-3"
                  confirmMessage={t("declineConfirm")}
                  pendingLabel={t("saving")}
                  submitLabel={t("declineRequest")}
                  variant="destructive"
                >
                  <input name="expectedVersion" type="hidden" value={request.version} />
                  <Label htmlFor="decline-reason">{t("reasonShared")}</Label>
                  <Textarea id="decline-reason" maxLength={1000} name="reason" required rows={2} />
                </ActionForm>
              </details>
            ) : null}
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-destructive underline">
                {t("cancelRequest")}
              </summary>
              <ActionForm
                action={adminCancelRequestAction.bind(null, locale, request.id)}
                className="mt-3"
                confirmMessage={t("cancelConfirm")}
                pendingLabel={t("saving")}
                submitLabel={t("cancelRequest")}
                variant="destructive"
              >
                <Label htmlFor="admin-cancel-reason">{t("reasonShared")}</Label>
                <Textarea id="admin-cancel-reason" maxLength={1000} name="reason" required rows={2} />
                <label className="flex items-center gap-2 text-sm">
                  <input defaultChecked name="fullRefund" type="checkbox" />
                  {t("fullRefund")}
                </label>
              </ActionForm>
            </details>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export async function SpecialistRequestPanel({
  bundle,
  locale,
}: {
  bundle: ServiceRequestBundle;
  locale: AppLocale;
}) {
  const t = await getTranslations({ locale, namespace: "services.staff" });
  const { request } = bundle;
  const kinds = schedulingKinds(bundle).filter((kind) =>
    kind === "primary" ? request.availability_requested : request.follow_up_status === "requested",
  );
  if (kinds.length === 0 && request.status !== "in_progress") {
    return (
      <p className="rounded-xl border bg-secondary/40 p-4 text-sm" role="status">
        {request.status === "completed" ? t("specialistDone") : t("specialistWaiting")}
      </p>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {kinds.length > 0 ? (
        <ProposeCard audience="specialist" bundle={bundle} kinds={kinds} locale={locale} />
      ) : null}
      <CompleteCard bundle={bundle} locale={locale} />
    </div>
  );
}
