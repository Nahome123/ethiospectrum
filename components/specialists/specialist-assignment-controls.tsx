"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  assignSpecialistToSupportRequestAction,
  revokeSpecialistFromSupportRequestAction,
} from "@/lib/specialists/actions";
import { initialSpecialistActionState } from "@/lib/specialists/action-state";

export type AssignableSpecialistOption = {
  id: string;
  label: string;
  isEligible: boolean;
  activeAssignmentCount: number;
};

export function SpecialistAssignmentControls({
  locale,
  requestId,
  assignmentVersion,
  canAssign,
  canRevoke,
  specialists,
}: {
  locale: AppLocale;
  requestId: string;
  assignmentVersion: number;
  canAssign: boolean;
  canRevoke: boolean;
  specialists: AssignableSpecialistOption[];
}) {
  const t = useTranslations("specialists");
  const [assignState, assignAction, assignPending] = useActionState(
    assignSpecialistToSupportRequestAction.bind(null, locale, requestId),
    initialSpecialistActionState,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeSpecialistFromSupportRequestAction.bind(null, locale, requestId),
    initialSpecialistActionState,
  );
  const eligible = specialists.filter((specialist) => specialist.isEligible);

  if (canAssign) {
    return (
      <form
        action={assignAction}
        className="space-y-3"
        onSubmit={(event) => {
          if (!window.confirm(t("confirmAssignment"))) event.preventDefault();
        }}
      >
        <input name="expectedAssignmentVersion" type="hidden" value={assignmentVersion} />
        <div className="space-y-1.5">
          <Label htmlFor="specialist-select">{t("assignSpecialist")}</Label>
          {eligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noEligibleSpecialists")}</p>
          ) : (
            <select
              className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3"
              id="specialist-select"
              name="specialistId"
              required
            >
              {eligible.map((specialist) => (
                <option key={specialist.id} value={specialist.id}>
                  {specialist.label} — {t("activeAssignments", { count: specialist.activeAssignmentCount })}
                </option>
              ))}
            </select>
          )}
        </div>
        {assignState.status === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            {assignState.message}
          </p>
        ) : null}
        {assignState.status === "success" ? (
          <p className="text-sm font-semibold text-primary" role="status">
            {assignState.message}
          </p>
        ) : null}
        <p aria-live="polite" className="sr-only">
          {assignPending ? t("assigning") : ""}
        </p>
        {eligible.length > 0 ? (
          <Button disabled={assignPending} type="submit">
            {assignPending ? t("assigning") : t("assignSpecialist")}
          </Button>
        ) : null}
      </form>
    );
  }

  if (!canRevoke) return null;

  return (
    <form
      action={revokeAction}
      className="space-y-3"
      onSubmit={(event) => {
        if (!window.confirm(t("confirmRevocation"))) event.preventDefault();
      }}
    >
      <input name="expectedAssignmentVersion" type="hidden" value={assignmentVersion} />
      {revokeState.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {revokeState.message}
        </p>
      ) : null}
      {revokeState.status === "success" ? (
        <p className="text-sm font-semibold text-primary" role="status">
          {revokeState.message}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {revokePending ? t("revoking") : ""}
      </p>
      <Button disabled={revokePending} type="submit" variant="outline">
        {revokePending ? t("revoking") : t("revokeAssignment")}
      </Button>
    </form>
  );
}
