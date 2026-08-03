import type { AppLocale } from "@/i18n/routing";

const parentStatuses = ["draft", "in_review", "published", "archived"] as const;
export type TranslationParentStatus = (typeof parentStatuses)[number];
export type TranslationDashboardRow = {
  locale: "am" | "es";
  workflowState: "notStarted" | "draft" | "in_review" | "approved" | "stale";
  isStale: boolean;
  sourceVersion: number | null;
  formattedLastUpdated: string | null;
  availableAction: "create" | "edit" | "review";
};
type DashboardTranslation = {
  locale: string;
  review_status: string;
  source_translation_version: number | null;
  updated_at: string | null;
};
export function parentStatus(value: string | null | undefined): TranslationParentStatus | null {
  return parentStatuses.includes(value as TranslationParentStatus)
    ? (value as TranslationParentStatus)
    : null;
}
export function formatTranslationUpdatedAt(
  value: string | null | undefined,
  locale: AppLocale,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? null
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
        date,
      );
}
export function translationDashboardRow(
  locale: "am" | "es",
  translation: DashboardTranslation | null,
  englishVersion: number,
  appLocale: AppLocale,
): TranslationDashboardRow {
  const isStale = Boolean(translation && translation.source_translation_version !== englishVersion);
  const workflowState = !translation
    ? "notStarted"
    : isStale
      ? "stale"
      : translation.review_status === "draft" ||
          translation.review_status === "in_review" ||
          translation.review_status === "approved"
        ? translation.review_status
        : "stale";
  return {
    locale,
    workflowState,
    isStale,
    sourceVersion: translation?.source_translation_version ?? null,
    formattedLastUpdated: formatTranslationUpdatedAt(translation?.updated_at, appLocale),
    availableAction: !translation ? "create" : translation.review_status === "draft" ? "edit" : "review",
  };
}
