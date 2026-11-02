"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { scheduleWeekdays, type WeeklyHour } from "@/lib/specialists/schedule";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Every half hour of the day, "00:00" through "23:30". */
const halfHours = Array.from(
  { length: 48 },
  (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
);

type Window = { start: string; end: string } | null;

/**
 * One row per weekday: a day is unavailable until it is switched on, then it
 * takes a From–To range on the half hour. Closed days submit no fields.
 */
export function WeeklyHoursFields({ hours }: { hours: WeeklyHour[] }) {
  const t = useTranslations("specialistConsole.availability");
  const locale = useLocale();
  const [windows, setWindows] = useState<Record<number, Window>>(() =>
    Object.fromEntries(
      scheduleWeekdays.map((weekday) => {
        const saved = hours.find((item) => item.weekday === weekday);
        return [weekday, saved ? { start: saved.start.slice(0, 5), end: saved.end.slice(0, 5) } : null];
      }),
    ),
  );
  const timeLabel = (value: string) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
      new Date(`2024-01-01T${value}:00Z`),
    );
  const dayName = (weekday: number) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 7 + weekday)),
    );
  const update = (weekday: number, next: Window) =>
    setWindows((current) => ({ ...current, [weekday]: next }));

  return (
    <div className="divide-y rounded-xl border">
      {scheduleWeekdays.map((weekday) => {
        const window = windows[weekday];
        const day = dayName(weekday);
        return (
          <div className="grid items-center gap-3 p-3 text-sm sm:grid-cols-[9rem_8rem_1fr]" key={weekday}>
            <span className="font-medium">{day}</span>
            <label className="flex items-center gap-2">
              <input
                checked={window !== null}
                className="size-4"
                onChange={(event) =>
                  update(weekday, event.target.checked ? { start: "09:00", end: "17:00" } : null)
                }
                type="checkbox"
              />
              <span className={window ? "font-semibold text-green-700" : "text-muted-foreground"}>
                {window ? t("dayOpen") : t("dayClosed")}
              </span>
            </label>
            {window ? (
              <div className="flex items-center gap-2">
                <select
                  aria-label={t("startsAt", { day })}
                  className={selectClass}
                  name={`start.${weekday}`}
                  onChange={(event) => {
                    const start = event.target.value;
                    // Keep the range valid: push the end an hour past a later start.
                    const end =
                      window.end > start ? window.end : (halfHours[halfHours.indexOf(start) + 2] ?? "23:30");
                    update(weekday, { start, end });
                  }}
                  value={window.start}
                >
                  {halfHours.slice(0, -1).map((value) => (
                    <option key={value} value={value}>
                      {timeLabel(value)}
                    </option>
                  ))}
                </select>
                <span className="text-muted-foreground">{t("to")}</span>
                <select
                  aria-label={t("endsAt", { day })}
                  className={selectClass}
                  name={`end.${weekday}`}
                  onChange={(event) => update(weekday, { ...window, end: event.target.value })}
                  value={window.end}
                >
                  {halfHours
                    .filter((value) => value > window.start)
                    .map((value) => (
                      <option key={value} value={value}>
                        {timeLabel(value)}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <span aria-hidden="true" className="hidden sm:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}
