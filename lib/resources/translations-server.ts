import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];
type TranslationRow = Database["public"]["Tables"]["resource_translations"]["Row"];
type AuditRow = Database["public"]["Tables"]["resource_translation_audit_events"]["Row"];

export type TranslationLocale = "am" | "es";
export type TranslationWithStaleness = TranslationRow & { isStale: boolean };
export type TranslationDashboard = {
  resource: ResourceRow;
  english: TranslationRow;
  translations: Record<TranslationLocale, TranslationWithStaleness | null>;
};

function withStaleness(translation: TranslationRow, englishVersion: number): TranslationWithStaleness {
  return { ...translation, isStale: translation.source_translation_version !== englishVersion };
}

export async function getTranslationDashboard(resourceId: string): Promise<TranslationDashboard | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data: resource } = await supabase.from("resources").select("*").eq("id", resourceId).maybeSingle();
  if (!resource) return null;
  const { data } = await supabase
    .from("resource_translations")
    .select("*")
    .eq("resource_id", resourceId)
    .in("locale", ["en", "am", "es"]);
  const translations = (data ?? []) as TranslationRow[];
  const english = translations.find((translation) => translation.locale === "en");
  if (!english) return null;
  const byLocale = (locale: TranslationLocale) => {
    const translation = translations.find((item) => item.locale === locale);
    return translation ? withStaleness(translation, english.version) : null;
  };
  return {
    resource: resource as ResourceRow,
    english,
    translations: { am: byLocale("am"), es: byLocale("es") },
  };
}

export async function getEditorTranslation(
  resourceId: string,
  locale: TranslationLocale,
): Promise<(TranslationDashboard & { translation: TranslationWithStaleness; audits: AuditRow[] }) | null> {
  const dashboard = await getTranslationDashboard(resourceId);
  const translation = dashboard?.translations[locale];
  if (!dashboard || !translation) return null;
  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("resource_translation_audit_events")
    .select("*")
    .eq("translation_id", translation.id)
    .order("created_at", { ascending: false });
  return { ...dashboard, translation, audits: (data ?? []) as AuditRow[] };
}
