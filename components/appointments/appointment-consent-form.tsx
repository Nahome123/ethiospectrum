"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { acceptSupportAppointmentAction, declineSupportAppointmentAction } from "@/lib/appointments/actions";
import { initialAppointmentActionState } from "@/lib/appointments/action-state";

/**
 * Consent binds to the exact appointment version on screen: if the specialist
 * changes anything, the stale version is rejected rather than silently accepted.
 */
export function AppointmentConsentForm({
  locale,
  requestId,
  appointmentId,
  version,
}: {
  locale: AppLocale;
  requestId: string;
  appointmentId: string;
  version: number;
}) {
  const t = useTranslations("appointments");
  const [acceptState, acceptAction, acceptPending] = useActionState(
    acceptSupportAppointmentAction.bind(null, locale, requestId, appointmentId),
    initialAppointmentActionState,
  );
  const [declineState, declineAction, declinePending] = useActionState(
    declineSupportAppointmentAction.bind(null, locale, requestId, appointmentId),
    initialAppointmentActionState,
  );

  return (
    <div className="space-y-4 rounded-xl border border-border bg-secondary/40 p-4">
      <h3 className="text-base font-bold">{t("consentTitle")}</h3>
      <p className="text-sm leading-6" id="appointment-consent-copy">
        {t("consentCopy")}
      </p>
      <p className="text-sm leading-6" id="appointment-consent-reschedule">
        {t("consentRescheduleNotice")}
      </p>

      <form action={acceptAction} className="space-y-3">
        <input name="expectedVersion" type="hidden" value={version} />
        <div className="flex items-start gap-2">
          <input
            aria-describedby="appointment-consent-copy appointment-consent-reschedule"
            className="mt-1 size-4"
            id="appointment-consent"
            name="acknowledged"
            required
            type="checkbox"
            value="on"
          />
          <Label className="leading-6" htmlFor="appointment-consent">
            {t("consentLabel")}
          </Label>
        </div>
        {acceptState.status === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            {acceptState.message}
          </p>
        ) : null}
        {acceptState.status === "success" ? (
          <p className="text-sm font-semibold text-primary" role="status">
            {acceptState.message}
          </p>
        ) : null}
        <p aria-live="polite" className="sr-only">
          {acceptPending ? t("accepting") : ""}
        </p>
        <Button disabled={acceptPending} type="submit">
          {acceptPending ? t("accepting") : t("acceptAppointment")}
        </Button>
      </form>

      <form action={declineAction}>
        <input name="expectedVersion" type="hidden" value={version} />
        {declineState.status === "error" ? (
          <p className="mb-2 text-sm text-destructive" role="alert">
            {declineState.message}
          </p>
        ) : null}
        <Button disabled={declinePending} type="submit" variant="outline">
          {declinePending ? t("declining") : t("declineAppointment")}
        </Button>
      </form>
    </div>
  );
}
