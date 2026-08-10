"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { proposeSupportAppointmentAction } from "@/lib/appointments/actions";
import { initialAppointmentActionState } from "@/lib/appointments/action-state";
import {
  APPOINTMENT_MEETING_URL_MAX,
  appointmentDurationValues,
  appointmentModalityValues,
} from "@/lib/appointments/constants";

export function AppointmentProposalForm({
  locale,
  requestId,
  defaultTimezone,
  supersedesAppointmentId,
}: {
  locale: AppLocale;
  requestId: string;
  defaultTimezone: string;
  supersedesAppointmentId?: string;
}) {
  const t = useTranslations("appointments");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [modality, setModality] = useState<(typeof appointmentModalityValues)[number]>("video");
  const [state, action, pending] = useActionState(
    proposeSupportAppointmentAction.bind(null, locale, requestId),
    initialAppointmentActionState,
  );

  return (
    <form action={action} className="space-y-5">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      {supersedesAppointmentId ? (
        <input name="supersedesAppointmentId" type="hidden" value={supersedesAppointmentId} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="appointment-date">{t("date")} *</Label>
          <Input id="appointment-date" name="localDate" required type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="appointment-time">{t("time")} *</Label>
          <Input id="appointment-time" name="localTime" required type="time" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="appointment-timezone">{t("timezone")} *</Label>
          <Input
            defaultValue={defaultTimezone}
            id="appointment-timezone"
            maxLength={64}
            name="timezone"
            required
          />
          <p className="text-sm text-muted-foreground">{t("timezoneHelp")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="appointment-duration">{t("duration")} *</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            defaultValue={45}
            id="appointment-duration"
            name="durationMinutes"
          >
            {appointmentDurationValues.map((duration) => (
              <option key={duration} value={duration}>
                {t("durationMinutes", { count: duration })}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appointment-modality">{t("meetingMethod")} *</Label>
        <select
          className="h-10 w-full max-w-sm rounded-md border border-input bg-background px-3"
          id="appointment-modality"
          name="modality"
          onChange={(event) => setModality(event.target.value as (typeof appointmentModalityValues)[number])}
          value={modality}
        >
          {appointmentModalityValues.map((value) => (
            <option key={value} value={value}>
              {t(`modalities.${value}`)}
            </option>
          ))}
        </select>
      </div>

      {modality === "video" ? (
        <div className="space-y-1.5">
          <Label htmlFor="appointment-meeting-url">{t("meetingLink")} *</Label>
          <Input
            aria-describedby="appointment-meeting-url-help"
            id="appointment-meeting-url"
            inputMode="url"
            maxLength={APPOINTMENT_MEETING_URL_MAX}
            name="meetingUrl"
            placeholder="https://"
            required
            type="url"
          />
          <p className="text-sm text-muted-foreground" id="appointment-meeting-url-help">
            {t("meetingLinkHelp")}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("phoneCoordinationNotice")}</p>
      )}

      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="text-sm font-semibold text-primary" role="status">
          {state.message}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {pending ? t("proposing") : ""}
      </p>

      <Button disabled={pending} type="submit">
        {pending ? t("proposing") : t("proposeAppointment")}
      </Button>
    </form>
  );
}
