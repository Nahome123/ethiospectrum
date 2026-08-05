"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { cancelSupportAppointmentAction, completeSupportAppointmentAction } from "@/lib/appointments/actions";
import { initialAppointmentActionState, type AppointmentActionState } from "@/lib/appointments/action-state";

type BoundAction = (state: AppointmentActionState, formData: FormData) => Promise<AppointmentActionState>;

function ConfirmedAction({
  action,
  confirmMessage,
  label,
  pendingLabel,
  version,
  rescheduleRequested = false,
  variant = "outline",
}: {
  action: BoundAction;
  confirmMessage: string;
  label: string;
  pendingLabel: string;
  version: number;
  rescheduleRequested?: boolean;
  variant?: "default" | "outline";
}) {
  const [state, formAction, pending] = useActionState(action, initialAppointmentActionState);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <input name="expectedVersion" type="hidden" value={version} />
      {rescheduleRequested ? <input name="rescheduleRequested" type="hidden" value="true" /> : null}
      <Button disabled={pending} type="submit" variant={variant}>
        {pending ? pendingLabel : label}
      </Button>
      {state.status === "error" ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="mt-2 text-sm font-semibold text-primary" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function AppointmentLifecycleControls({
  locale,
  requestId,
  appointmentId,
  version,
  canCancel,
  canComplete,
  showRescheduleRequest,
}: {
  locale: AppLocale;
  requestId: string;
  appointmentId: string;
  version: number;
  canCancel: boolean;
  canComplete: boolean;
  showRescheduleRequest: boolean;
}) {
  const t = useTranslations("appointments");
  const cancelAction = cancelSupportAppointmentAction.bind(null, locale, requestId, appointmentId);

  return (
    <div className="flex flex-wrap gap-2">
      {canCancel ? (
        <ConfirmedAction
          action={cancelAction}
          confirmMessage={t("cancelConfirm")}
          label={t("cancelAppointment")}
          pendingLabel={t("cancelling")}
          version={version}
        />
      ) : null}
      {canCancel && showRescheduleRequest ? (
        <ConfirmedAction
          action={cancelAction}
          confirmMessage={t("rescheduleConfirm")}
          label={t("requestAnotherTime")}
          pendingLabel={t("cancelling")}
          rescheduleRequested
          version={version}
        />
      ) : null}
      {canComplete ? (
        <ConfirmedAction
          action={completeSupportAppointmentAction.bind(null, locale, requestId, appointmentId)}
          confirmMessage={t("completeConfirm")}
          label={t("markCompleted")}
          pendingLabel={t("completing")}
          variant="default"
          version={version}
        />
      ) : null}
    </div>
  );
}
