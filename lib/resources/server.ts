import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
import type { ResourceCategory, ResourceReviewStatus, ResourceStatus } from "./constants";
import type { AppLocale } from "@/i18n/routing";
import { resourceTranslationPaginationSchema } from "@/lib/validation/resource-translations";

type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];
type TranslationRow = Database["public"]["Tables"]["resource_translations"]["Row"];
type AuditRow = Database["public"]["Tables"]["resource_audit_events"]["Row"];

export type ResourceCard = Pick<ResourceRow, "slug" | "category" | "published_at"> &
  Pick<TranslationRow, "title" | "summary"> & { selectedLocale: AppLocale; usingEnglishFallback: boolean };
export type EditorResource = ResourceRow & { english: TranslationRow | null };
export type ResourceAccountHolder = { id: string; label: string };

export async function getResourceAccountHolders(): Promise<ResourceAccountHolder[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase.rpc("list_resource_account_holders");
  return (data ?? []).map((account) => ({
    id: account.user_id,
    label: [account.first_name, account.last_name].filter(Boolean).join(" ") || "Account holder",
  }));
}

export async function getPublishedResources(
  locale: AppLocale,
  category?: ResourceCategory,
  requestedPage: unknown = 1,
): Promise<ResourceCard[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase.rpc("list_published_resources", {
    input_locale: locale,
    input_category: category,
  });
  const page = resourceTranslationPaginationSchema.safeParse(requestedPage);
  const offset = ((page.success ? page.data : 1) - 1) * 24;
  return (data ?? []).slice(offset, offset + 24).map((resource) => ({
    slug: resource.slug,
    category: resource.category,
    published_at: resource.published_at,
    title: resource.title,
    summary: resource.summary,
    selectedLocale: resource.selected_locale as AppLocale,
    usingEnglishFallback: resource.using_english_fallback,
  }));
}

export async function getPublishedResource(
  slug: string,
  locale: AppLocale,
): Promise<{
  slug: string;
  category: string;
  published_at: string | null;
  title: string;
  summary: string;
  body: string;
  selectedLocale: AppLocale;
  usingEnglishFallback: boolean;
} | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase.rpc("get_published_resource", { input_slug: slug, input_locale: locale });
  const resource = data?.[0];
  return resource
    ? {
        slug: resource.slug,
        category: resource.category,
        published_at: resource.published_at,
        title: resource.title,
        summary: resource.summary,
        body: resource.body,
        selectedLocale: resource.selected_locale as AppLocale,
        usingEnglishFallback: resource.using_english_fallback,
      }
    : null;
}

export async function getEditorResources(
  filters: { status?: ResourceStatus; category?: ResourceCategory } = {},
): Promise<EditorResource[]> {
  const supabase = await createServerComponentSupabaseClient();
  let query = supabase.from("resources").select("*").order("updated_at", { ascending: false });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);
  const { data: resources } = await query;
  if (!resources?.length) return [];
  const { data: translations } = await supabase
    .from("resource_translations")
    .select("*")
    .in(
      "resource_id",
      resources.map((resource) => resource.id),
    )
    .eq("locale", "en");
  const englishByResource = new Map(
    (translations ?? []).map((translation) => [translation.resource_id, translation as TranslationRow]),
  );
  return (resources as ResourceRow[]).map((resource) => ({
    ...resource,
    english: englishByResource.get(resource.id) ?? null,
  }));
}

export async function getEditorResource(
  resourceId: string,
): Promise<(EditorResource & { audits: AuditRow[] }) | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data: resource } = await supabase.from("resources").select("*").eq("id", resourceId).maybeSingle();
  if (!resource) return null;
  const [{ data: english }, { data: audits }] = await Promise.all([
    supabase
      .from("resource_translations")
      .select("*")
      .eq("resource_id", resourceId)
      .eq("locale", "en")
      .maybeSingle(),
    supabase
      .from("resource_audit_events")
      .select("*")
      .eq("resource_id", resourceId)
      .order("created_at", { ascending: false }),
  ]);
  return {
    ...(resource as ResourceRow),
    english: (english as TranslationRow | null) ?? null,
    audits: (audits ?? []) as AuditRow[],
  };
}

export function isReviewStatus(value: string): value is ResourceReviewStatus {
  return value === "draft" || value === "in_review" || value === "approved";
}
