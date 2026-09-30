/** Pure display helpers shared by server pages. */

export function localizedText(
  localized: unknown,
  locale: string,
  field: string,
  english: string | null,
  translatedDefault: string,
): string {
  if (locale !== "en" && localized && typeof localized === "object" && !Array.isArray(localized)) {
    const entry = (localized as Record<string, unknown>)[locale];
    if (entry && typeof entry === "object") {
      const value = (entry as Record<string, unknown>)[field];
      if (typeof value === "string" && value.trim()) return value;
    }
    return translatedDefault;
  }
  return english ?? translatedDefault;
}

export function localizedInstruction(instructions: unknown, locale: string): string | null {
  if (!instructions || typeof instructions !== "object" || Array.isArray(instructions)) return null;
  const record = instructions as Record<string, unknown>;
  const value = record[locale] ?? record.en;
  return typeof value === "string" && value.trim() ? value : null;
}

export function topicLabel(labels: unknown, locale: string): string {
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) return "";
  const record = labels as Record<string, unknown>;
  const value = record[locale] ?? record.en;
  return typeof value === "string" ? value : "";
}

const intlLocales: Record<string, string> = { en: "en-US", am: "am-ET", es: "es-US" };

/** Full date and time with the zone name; dateStyle cannot be combined with timeZoneName. */
export const fullDateTimeOptions: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

export function formatDateTime(iso: string, locale: string, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat(intlLocales[locale] ?? "en-US", {
      ...fullDateTimeOptions,
      timeZone: timeZone ?? undefined,
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat(intlLocales[locale] ?? "en-US", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(iso));
  }
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocales[locale] ?? "en-US", { dateStyle: "medium" }).format(
    new Date(iso),
  );
}

export function formatShortDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocales[locale] ?? "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Hours from `now` until `iso` (negative when in the past). */
export function hoursUntil(iso: string, now: Date = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 3_600_000;
}
