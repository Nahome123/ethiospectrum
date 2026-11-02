"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { scheduleWeekdays, type WeeklyHour } from "@/lib/specialists/schedule";
import { useFormResetKey } from "./use-form-reset-key";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Every half hour of the day, "00:00" through "23:30". */
const halfHours = Array.from(
  { length: 48 },
  (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
);

type Range = { start: string; end: string };
type Week = Record<number, Range | null>;

function savedWeek(hours: WeeklyHour[]): Week {
  return Object.fromEntries(
    scheduleWeekdays.map((weekday) => {
      const saved = hours.find((item) => item.weekday === weekday);
      return [weekday, saved ? { start: saved.start.slice(0, 5), end: saved.end.slice(0, 5) } : null];
    }),
  );
}

/**
 * One row per weekday. A day is unavailable until it is ticked; a ticked day
 * takes a From–To range on the hour or half hour. Unticked days submit no
 * fields, so they are saved as closed.
 */
export function WeeklyHoursFields({ hours }: { hours: WeeklyHour[] }) {
  const t = useTranslations("specialistConsole.availability");
  const locale = useLocale();
  const [week, setWeek] = useState(() => savedWeek(hours));
  const [root, resetKey] = useFormResetKey<HTMLDivElement>();

  const timeLabel = (value: string) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
      new Date(`2024-01-01T${value}:00Z`),
    );
  const dayName = (weekday: number) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 7 + weekday)),
    );
  const set = (weekday: number, range: Range | null) =>
    setWeek((current) => ({ ...current, [weekday]: range }));
  // A newly opened day starts with the hours of the nearest open day above it.
  const suggested = (weekday: number): Range => {
    const above = scheduleWeekdays.slice(0, scheduleWeekdays.indexOf(weekday as never)).reverse();
    return above.map((day) => week[day]).find((range) => range) ?? { start: "09:00", end: "17:00" };
  };

  return (
    <div className="divide-y rounded-xl border" key={resetKey} ref={root}>
      {scheduleWeekdays.map((weekday) => {
        const range = week[weekday];
        const day = dayName(weekday);
        return (
          <div
            className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm"
            key={weekday}
          >
            <label className="flex w-36 cursor-pointer items-center gap-3 font-medium">
              <input
                checked={range !== null}
                className="size-4"
                onChange={(event) => set(weekday, event.target.checked ? suggested(weekday) : null)}
                type="checkbox"
              />
              {day}
            </label>
            {range ? (
              <div className="flex flex-1 items-center gap-2">
                <select
                  aria-label={t("startsAt", { day })}
                  className={selectClass}
                  name={`start.${weekday}`}
                  onChange={(event) => {
                    const start = event.target.value;
                    // A start at or after the end moves the end to an hour later.
                    const end =
                      range.end > start ? range.end : (halfHours[halfHours.indexOf(start) + 2] ?? "23:30");
                    set(weekday, { start, end });
                  }}
                  value={range.start}
                >
                  {halfHours.slice(0, -1).map((value) => (
                    <option key={value} value={value}>
                      {timeLabel(value)}
                    </option>
                  ))}
                </select>
                <span className="shrink-0 text-muted-foreground">{t("to")}</span>
                <select
                  aria-label={t("endsAt", { day })}
                  className={selectClass}
                  name={`end.${weekday}`}
                  onChange={(event) => set(weekday, { ...range, end: event.target.value })}
                  value={range.end}
                >
                  {halfHours
                    .filter((value) => value > range.start)
                    .map((value) => (
                      <option key={value} value={value}>
                        {timeLabel(value)}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <span className="flex-1 text-muted-foreground">{t("dayClosed")}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
