"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { initialReminderActionState } from "@/lib/reminders/action-state";
import { updateReminderAction } from "@/lib/reminders/actions";

export function ReminderEditForm({
  dueDate,
  locale,
  reminder,
}: Readonly<{
  dueDate: string;
  locale: AppLocale;
  reminder: {
    id: string;
    offsetDays: number | null;
    localTime: string | null;
    scheduleVersion: number;
    timezone: string | null;
  };
}>) {
  const t = useTranslations("reminders");
  const action = updateReminderAction.bind(null, locale, reminder.id, dueDate);
  const [state, formAction, pending] = useActionState(action, initialReminderActionState);
  return (
    <form action={formAction} className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
      <input name="expectedScheduleVersion" type="hidden" value={reminder.scheduleVersion} />
      <h1 className="text-2xl font-bold">{t("save")}</h1>
      <label className="grid gap-2 text-sm font-semibold">
        {t("offset")}
        <select
          className="min-h-10 rounded-md border bg-background px-3"
          defaultValue={reminder.offsetDays ?? 0}
          name="offsetDays"
        >
          <option value="0">{t("onDueDate")}</option>
          <option value="1">{t("oneDayBefore")}</option>
          <option value="3">{t("threeDaysBefore")}</option>
          <option value="7">{t("sevenDaysBefore")}</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        {t("time")}
        <input
          className="min-h-10 rounded-md border bg-background px-3"
          defaultValue={(reminder.localTime ?? "09:00").slice(0, 5)}
          name="localTime"
          required
          type="time"
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        {t("timezone")}
        <input
          className="min-h-10 rounded-md border bg-background px-3"
          defaultValue={reminder.timezone ?? ""}
          name="timezone"
          required
        />
      </label>
      {state.status !== "idle" ? (
        <p
          className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-primary"}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
