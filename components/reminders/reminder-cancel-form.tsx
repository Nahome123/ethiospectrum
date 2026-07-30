"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { cancelReminderAction } from "@/lib/reminders/actions";
import { initialReminderActionState } from "@/lib/reminders/action-state";

export function ReminderCancelForm({
  locale,
  reminderId,
  updatedAt,
}: Readonly<{ locale: AppLocale; reminderId: string; updatedAt: string }>) {
  const t = useTranslations("reminders");
  const action = cancelReminderAction.bind(null, locale, reminderId);
  const [state, formAction, pending] = useActionState(action, initialReminderActionState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input name="expectedUpdatedAt" type="hidden" value={updatedAt} />
      <Button disabled={pending} type="submit" variant="destructive">
        {t("cancel")}
      </Button>
      {state.status !== "idle" ? (
        <p
          className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-primary"}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
