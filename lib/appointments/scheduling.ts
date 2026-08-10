import { Temporal } from "@js-temporal/polyfill";
import {
  APPOINTMENT_MAX_HORIZON_DAYS,
  APPOINTMENT_MIN_LEAD_HOURS,
  type AppointmentDuration,
} from "./constants";

export type AppointmentScheduleErrorCode =
  "invalid_timezone" | "nonexistent_time" | "ambiguous_time" | "too_soon" | "too_far";

export class AppointmentScheduleError extends Error {
  constructor(public readonly code: AppointmentScheduleErrorCode) {
    super(code);
    this.name = "AppointmentScheduleError";
  }
}

/**
 * Mirrors the database's authoritative resolution so the browser gets an early,
 * localized error. The stored instant always comes from PostgreSQL, never from
 * this calculation and never from the browser's own timezone.
 */
export function resolveAppointmentInstant({
  localDate,
  localTime,
  timezone,
  durationMinutes,
  now = Temporal.Now.instant(),
}: {
  localDate: string;
  localTime: string;
  timezone: string;
  durationMinutes: AppointmentDuration;
  now?: Temporal.Instant;
}) {
  let local: Temporal.PlainDateTime;
  try {
    local = Temporal.PlainDate.from(localDate).toPlainDateTime(Temporal.PlainTime.from(localTime));
  } catch {
    throw new AppointmentScheduleError("invalid_timezone");
  }

  let earlier: Temporal.ZonedDateTime;
  let later: Temporal.ZonedDateTime;
  try {
    earlier = local.toZonedDateTime(timezone, { disambiguation: "earlier" });
    later = local.toZonedDateTime(timezone, { disambiguation: "later" });
  } catch {
    throw new AppointmentScheduleError("invalid_timezone");
  }

  // Spring-forward: the wall-clock time never occurs in this zone.
  if (!earlier.toPlainDateTime().equals(local) || !later.toPlainDateTime().equals(local)) {
    throw new AppointmentScheduleError("nonexistent_time");
  }
  // Fall-back: two instants share the wall-clock time, so refuse to guess.
  if (earlier.epochNanoseconds !== later.epochNanoseconds) {
    throw new AppointmentScheduleError("ambiguous_time");
  }

  const instant = earlier.toInstant();
  if (Temporal.Instant.compare(instant, now.add({ hours: APPOINTMENT_MIN_LEAD_HOURS })) < 0) {
    throw new AppointmentScheduleError("too_soon");
  }
  if (Temporal.Instant.compare(instant, now.add({ hours: APPOINTMENT_MAX_HORIZON_DAYS * 24 })) > 0) {
    throw new AppointmentScheduleError("too_far");
  }

  return {
    startsAtUtc: instant.toString(),
    endsAtUtc: instant.add({ minutes: durationMinutes }).toString(),
    localDateTime: `${localDate}T${local.toPlainTime().toString({ smallestUnit: "minute" })}`,
    offsetMinutes: Math.round(Number(earlier.offsetNanoseconds) / 60_000_000_000),
  };
}

/** Half-open intervals, so a back-to-back appointment is not a conflict. */
export function appointmentsOverlap(
  first: { startsAt: string; endsAt: string },
  second: { startsAt: string; endsAt: string },
): boolean {
  return first.startsAt < second.endsAt && first.endsAt > second.startsAt;
}

export function isSupportedTimezone(timezone: string): boolean {
  if (timezone.trim() === "") return false;
  try {
    // Intl rejects unknown zone names, matching the database's own check.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Renders an instant in its confirmed timezone; the viewer's zone is additive. */
export function formatAppointmentInZone(startsAtUtc: string, timezone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(startsAtUtc));
}
