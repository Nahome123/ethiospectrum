import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
import {
  MEMBER_RESOURCE_PAGE_SIZE,
  type ResourceCategory,
  type ResourceReviewStatus,
  type ResourceStatus,
  type ResourceType,
} from "./constants";
import type { AppLocale } from "@/i18n/routing";
import { resourceTranslationPaginationSchema } from "@/lib/validation/resource-translations";
import type { MemberResourceQuery } from "@/lib/validation/resources";

type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];
type TranslationRow = Database["public"]["Tables"]["resource_translations"]["Row"];
type AuditRow = Database["public"]["Tables"]["resource_audit_events"]["Row"];

export type ResourceCard = Pick<ResourceRow, "slug" | "category" | "published_at"> &
  Pick<TranslationRow, "title" | "summary"> & { selectedLocale: AppLocale; usingEnglishFallback: boolean };
export type EditorResource = ResourceRow & { english: TranslationRow | null };
export type ResourceAccountHolder = { id: string; label: string };

export type MemberResourceCard = {
  slug: string;
  category: ResourceCategory;
  resourceType: ResourceType;
  publishedAt: string;
  title: string;
  summary: string;
  selectedLocale: AppLocale;
  usingEnglishFallback: boolean;
  isBookmarked: boolean;
  isAssigned: boolean;
  isFeatured: boolean;
};

export type MemberResourcePage = {
  items: MemberResourceCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type MemberResourceDetail = Omit<MemberResourceCard, "isFeatured"> & {
  body: string;
  isOnRoadmap: boolean;
};

function mapMemberResource(
  resource: Database["public"]["Functions"]["list_member_resources"]["Returns"][number],
): MemberResourceCard {
  return {
    slug: resource.slug,
    category: resource.category as ResourceCategory,
    resourceType: resource.resource_type as ResourceType,
    publishedAt: resource.published_at,
    title: resource.title,
    summary: resource.summary,
    selectedLocale: resource.selected_locale as AppLocale,
    usingEnglishFallback: resource.using_english_fallback,
    isBookmarked: resource.is_bookmarked,
    isAssigned: resource.is_assigned,
    isFeatured: resource.is_featured,
  };
}

export async function getMemberResources(
  locale: AppLocale,
  query: Partial<MemberResourceQuery> & {
    assignedOnly?: boolean;
    featuredOnly?: boolean;
    pageSize?: number;
  } = {},
): Promise<MemberResourcePage> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? MEMBER_RESOURCE_PAGE_SIZE;
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_member_resources", {
    input_locale: locale,
    input_query: query.q || undefined,
    input_category: query.category,
    input_resource_type: query.type,
    input_bookmarked_only: query.bookmarked ?? false,
    input_assigned_only: query.assignedOnly ?? query.assigned ?? false,
    input_featured_only: query.featuredOnly ?? query.featured ?? false,
    input_page: page,
    input_page_size: pageSize,
  });
  if (error) throw new Error("Unable to load member resources.");
  const total = data?.[0]?.total_count ?? 0;
  return {
    items: (data ?? []).map(mapMemberResource),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getMemberResource(
  slug: string,
  locale: AppLocale,
): Promise<MemberResourceDetail | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_member_resource", {
    input_slug: slug,
    input_locale: locale,
  });
  if (error) throw new Error("Unable to load the member resource.");
  const resource = data?.[0];
  return resource
    ? {
        slug: resource.slug,
        category: resource.category as ResourceCategory,
        resourceType: resource.resource_type as ResourceType,
        publishedAt: resource.published_at,
        title: resource.title,
        summary: resource.summary,
        body: resource.body,
        selectedLocale: resource.selected_locale as AppLocale,
        usingEnglishFallback: resource.using_english_fallback,
        isBookmarked: resource.is_bookmarked,
        isAssigned: resource.is_assigned,
        isOnRoadmap: resource.is_on_roadmap,
      }
    : null;
}

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
