import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
import type { ResourceCategory, ResourceReviewStatus, ResourceStatus } from "./constants";

type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];
type TranslationRow = Database["public"]["Tables"]["resource_translations"]["Row"];
type AuditRow = Database["public"]["Tables"]["resource_audit_events"]["Row"];

export type ResourceCard = Pick<ResourceRow, "id" | "slug" | "category" | "published_at" | "status"> &
  Pick<TranslationRow, "title" | "summary">;
export type EditorResource = ResourceRow & { english: TranslationRow | null };

function mapEnglish(resources: ResourceRow[], translations: TranslationRow[]): ResourceCard[] {
  const englishByResource = new Map(
    translations.map((translation) => [translation.resource_id, translation]),
  );
  return resources.flatMap((resource) => {
    const english = englishByResource.get(resource.id);
    return english ? [{ ...resource, title: english.title, summary: english.summary }] : [];
  });
}

export async function getPublishedResources(category?: ResourceCategory): Promise<ResourceCard[]> {
  const supabase = await createServerComponentSupabaseClient();
  let query = supabase
    .from("resources")
    .select("id,slug,category,published_at,status")
    .eq("status", "published")
    .is("archived_at", null)
    .order("published_at", { ascending: false });
  if (category) query = query.eq("category", category);
  const { data: resources } = await query;
  if (!resources?.length) return [];
  const { data: translations } = await supabase
    .from("resource_translations")
    .select("resource_id,title,summary")
    .in(
      "resource_id",
      resources.map((resource) => resource.id),
    )
    .eq("locale", "en")
    .eq("review_status", "approved");
  return mapEnglish(resources as ResourceRow[], (translations ?? []) as TranslationRow[]);
}

export async function getPublishedResource(
  slug: string,
): Promise<(ResourceRow & { english: TranslationRow }) | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data: resource } = await supabase
    .from("resources")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .is("archived_at", null)
    .maybeSingle();
  if (!resource) return null;
  const { data: english } = await supabase
    .from("resource_translations")
    .select("*")
    .eq("resource_id", resource.id)
    .eq("locale", "en")
    .eq("review_status", "approved")
    .maybeSingle();
  return english ? { ...(resource as ResourceRow), english: english as TranslationRow } : null;
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
