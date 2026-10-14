"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PickerMode = "year" | "date" | "datetime";

const YEARS_PER_PAGE = 12;

function display(mode: PickerMode, value: string, locale: string): string {
  if (!value) return "";
  if (mode === "year") return value;
  // Parse the local value without a time zone shift.
  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(mode === "datetime" ? { timeStyle: "short" } : {}),
  }).format(date);
}

/**
 * A pop-up picker whose choice only takes effect after "Confirm". Works as a
 * plain form field (`name` + `defaultValue`) or controlled (`value` +
 * `onChange`). Modes: a year grid, a date, or a date and time.
 */
export function ConfirmPicker({
  defaultValue = "",
  describedBy,
  id,
  invalid = false,
  max,
  min,
  mode,
  name,
  onChange,
  placeholder,
  required = false,
  value,
}: {
  defaultValue?: string;
  describedBy?: string;
  id: string;
  invalid?: boolean;
  /** Year, yyyy-mm-dd, or yyyy-mm-ddThh:mm, matching the mode. */
  max?: string;
  min?: string;
  mode: PickerMode;
  name?: string;
  onChange?: (value: string) => void;
  placeholder: string;
  required?: boolean;
  value?: string;
}) {
  const t = useTranslations("common.picker");
  const locale = useLocale();
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const committed = value ?? uncontrolled;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(committed);
  const root = useRef<HTMLDivElement>(null);
  const panelId = `${id}-picker`;

  const currentYear = new Date().getFullYear();
  const maxYear = mode === "year" && max ? Number(max) : currentYear;
  const minYear = mode === "year" && min ? Number(min) : 1900;
  // Pages run downward from the latest year: maxYear, maxYear - 12, ...
  const pageFor = (year: number) =>
    maxYear -
    Math.floor((maxYear - Math.min(Math.max(year, minYear), maxYear)) / YEARS_PER_PAGE) * YEARS_PER_PAGE;
  const [pageStart, setPageStart] = useState(() => pageFor(Number(committed) || maxYear));

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !root.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  function openPicker() {
    setDraft(committed);
    setPageStart(pageFor(Number(committed) || maxYear));
    setOpen(true);
  }

  function confirm() {
    if (value === undefined) setUncontrolled(draft);
    onChange?.(draft);
    setOpen(false);
  }

  const years = Array.from({ length: YEARS_PER_PAGE }, (_, index) => pageStart - index).filter(
    (year) => year >= minYear && year <= maxYear,
  );

  return (
    <div className="relative" ref={root}>
      {name ? (
        // Carries the confirmed value; positioned under the button so a
        // "required" message points at it.
        <input
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0"
          name={name}
          onChange={() => undefined}
          required={required}
          tabIndex={-1}
          value={committed}
        />
      ) : null}
      <button
        aria-controls={panelId}
        aria-describedby={describedBy}
        aria-expanded={open}
        className={cn(
          "relative flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm",
          "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
          invalid && "border-destructive",
        )}
        id={id}
        onClick={() => (open ? setOpen(false) : openPicker())}
        type="button"
      >
        <span className={committed ? "" : "text-muted-foreground"}>
          {committed ? display(mode, committed, locale) : placeholder}
        </span>
        <CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />
      </button>

      {open ? (
        <div
          aria-label={placeholder}
          className="absolute left-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-3 shadow-[0_16px_40px_rgba(24,41,59,0.14)]"
          id={panelId}
          role="dialog"
        >
          {mode === "year" ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <button
                  aria-label={t("earlierYears")}
                  className="rounded-md p-1.5 hover:bg-tint disabled:opacity-40"
                  disabled={pageStart - YEARS_PER_PAGE < minYear}
                  onClick={() => setPageStart((start) => start - YEARS_PER_PAGE)}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </button>
                <span className="text-sm font-semibold">
                  {years[years.length - 1]}–{years[0]}
                </span>
                <button
                  aria-label={t("laterYears")}
                  className="rounded-md p-1.5 hover:bg-tint disabled:opacity-40"
                  disabled={pageStart + 1 > maxYear}
                  onClick={() => setPageStart((start) => Math.min(maxYear, start + YEARS_PER_PAGE))}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {years.map((year) => (
                  <button
                    aria-pressed={draft === String(year)}
                    className={cn(
                      "rounded-lg py-2 text-sm font-semibold hover:bg-tint",
                      draft === String(year) && "bg-primary text-primary-foreground hover:bg-primary-hover",
                    )}
                    key={year}
                    onClick={() => setDraft(String(year))}
                    type="button"
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <input
              aria-label={placeholder}
              autoFocus
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              max={max}
              min={min}
              onChange={(event) => setDraft(event.target.value)}
              type={mode === "date" ? "date" : "datetime-local"}
              value={draft}
            />
          )}
          <div className="mt-3 flex justify-end gap-2">
            {!required && draft ? (
              <Button
                className="mr-auto"
                onClick={() => setDraft("")}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("clear")}
              </Button>
            ) : null}
            <Button onClick={() => setOpen(false)} size="sm" type="button" variant="outline">
              {t("cancel")}
            </Button>
            <Button disabled={required && !draft} onClick={confirm} size="sm" type="button">
              {t("confirm")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
