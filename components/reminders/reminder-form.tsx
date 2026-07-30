"use client";

import { useActionState, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { createReminderAction } from "@/lib/reminders/actions";
import { initialReminderActionState } from "@/lib/reminders/action-state";
import { Button } from "@/components/ui/button";

const offsets = [0, 1, 3, 7] as const;

export function ReminderForm({
  dueDate,
  itemId,
  locale,
  title,
}: Readonly<{ dueDate: string; itemId: string; locale: AppLocale; title: string }>) {
  const t = useTranslations("reminders");
  const action = createReminderAction.bind(null, locale);
  const [state, formAction, pending] = useActionState(action, initialReminderActionState);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const labels: Record<(typeof offsets)[number], string> = {
    0: t("onDueDate"),
    1: t("oneDayBefore"),
    3: t("threeDaysBefore"),
    7: t("sevenDaysBefore"),
  };
  const suggestedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <form action={formAction} className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
      <input name="roadmapItemId" type="hidden" value={itemId} />
      <input name="dueDate" type="hidden" value={dueDate} />
      <input name="consentVersion" type="hidden" value="2026-07-30" />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div>
        <h1 className="text-2xl font-bold">{t("newReminder")}</h1>
        <p className="mt-1 break-words text-sm text-muted-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">
          {t("dueDate")}: {dueDate}
        </p>
      </div>
      <label className="grid gap-2 text-sm font-semibold">
        {t("offset")}
        <select className="min-h-10 rounded-md border bg-background px-3" defaultValue="0" name="offsetDays">
          {offsets.map((offset) => (
            <option key={offset} value={offset}>
              {labels[offset]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        {t("time")}
        <input
          className="min-h-10 rounded-md border bg-background px-3"
          defaultValue="09:00"
          name="localTime"
          required
          type="time"
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        {t("timezone")}
        <input
          className="min-h-10 rounded-md border bg-background px-3"
          defaultValue={suggestedTimezone}
          name="timezone"
          required
        />
        <span className="text-xs font-normal text-muted-foreground">
          {t("suggestedTimezone")}: {suggestedTimezone}
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input className="mt-1 size-4" name="timezoneConfirmation" required type="checkbox" />
        <span>{t("confirmTimezone")}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input className="mt-1 size-4" name="consent" required type="checkbox" value="on" />
        <span>{t("consent")}</span>
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
