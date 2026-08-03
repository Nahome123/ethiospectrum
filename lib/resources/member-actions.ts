"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { resourceBookmarkIntentSchema, resourceSlugSchema } from "@/lib/validation/resources";
import type { MemberResourceActionState } from "./member-action-state";

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

function revalidateMemberResource(locale: AppLocale, slug: string) {
  revalidatePath(`/${locale}/member/resources`);
  revalidatePath(`/${locale}/member/resources/${slug}`);
}

export async function updateResourceBookmarkAction(
  localeValue: string,
  slugValue: string,
  _state: MemberResourceActionState,
  formData: FormData,
): Promise<MemberResourceActionState> {
  if (!isAppLocale(localeValue)) return { status: "error", message: "" };
  const t = await getTranslations({ locale: localeValue, namespace: "resources" });
  const input = resourceBookmarkIntentSchema.safeParse({
    slug: slugValue,
    bookmarked: String(formData.get("bookmarked") ?? ""),
  });
  if (!input.success) return { status: "error", message: t("actionError") };

  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.rpc("set_resource_bookmark", {
    input_slug: input.data.slug,
    input_bookmarked: input.data.bookmarked,
  });
  if (error || data !== input.data.bookmarked) {
    return { status: "error", message: t("actionError") };
  }

  revalidateMemberResource(localeValue, input.data.slug);
  return {
    status: "success",
    message: t(input.data.bookmarked ? "bookmarkSaved" : "bookmarkRemoved"),
    bookmarked: input.data.bookmarked,
  };
}

export async function addResourceToRoadmapAction(
  localeValue: string,
  slugValue: string,
  state: MemberResourceActionState,
  formData: FormData,
): Promise<MemberResourceActionState> {
  void state;
  void formData;
  if (!isAppLocale(localeValue)) return { status: "error", message: "" };
  const t = await getTranslations({ locale: localeValue, namespace: "resources" });
  const slug = resourceSlugSchema.safeParse(slugValue);
  if (!slug.success) return { status: "error", message: t("roadmapError") };

  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.rpc("add_resource_to_roadmap", {
    input_slug: slug.data,
    input_locale: localeValue,
  });
  const result = data?.[0];
  if (error || !result?.item_id) return { status: "error", message: t("roadmapError") };

  revalidateMemberResource(localeValue, slug.data);
  revalidatePath(`/${localeValue}/roadmap`);
  revalidatePath(`/${localeValue}/dashboard`);
  return {
    status: "success",
    message: t(result.already_exists ? "alreadyOnRoadmap" : "addedToRoadmap"),
    onRoadmap: true,
  };
}
