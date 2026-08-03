"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import {
  resourceTranslationCreateSchema,
  resourceTranslationRejectionSchema,
  resourceTranslationTransitionSchema,
  resourceTranslationUpdateSchema,
} from "@/lib/validation/resource-translations";
import type { ResourceActionState } from "./action-state";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

async function canManageTranslations(): Promise<boolean> {
  const user = await getAuthenticatedUser();
  return user?.role === "administrator" || user?.role === "content_editor";
}

function paths(
  locale: AppLocale,
  resourceId: string,
  translationLocale?: "am" | "es",
  publicContent = false,
) {
  revalidatePath(`/${locale}/editor/resources/${resourceId}/translations`);
  if (translationLocale) {
    revalidatePath(`/${locale}/editor/resources/${resourceId}/translations/${translationLocale}`);
    revalidatePath(`/${locale}/editor/resources/${resourceId}/translations/${translationLocale}/edit`);
    revalidatePath(`/${locale}/editor/resources/${resourceId}/translations/${translationLocale}/review`);
  }
  if (publicContent && translationLocale) {
    revalidatePath(`/${translationLocale}/resources`);
    revalidatePath(`/${translationLocale}/resources/[slug]`, "page");
  }
}

function message(
  error: { code?: string; message?: string } | null,
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  if (error?.code === "40001")
    return error.message?.includes("English source")
      ? t("englishSourceChanged")
      : t("translationUpdatedElsewhere");
  if (error?.message?.includes("review")) return t("selfReviewError");
  return t("translationActionError");
}

export async function createResourceTranslation(
  locale: AppLocale,
  _state: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const t = await getTranslations({ locale, namespace: "resourceWorkflow" });
  const input = resourceTranslationCreateSchema.safeParse({
    resourceId: field(formData, "resourceId"),
    locale: field(formData, "translationLocale"),
    title: field(formData, "title"),
    summary: field(formData, "summary"),
    body: field(formData, "body"),
  });
  if (!input.success || !(await canManageTranslations()))
    return { status: "error", message: t("validationError") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("create_resource_translation_draft", {
    target_resource_id: input.data.resourceId,
    input_locale: input.data.locale,
    input_title: input.data.title,
    input_summary: input.data.summary,
    input_body: input.data.body,
  });
  if (error) return { status: "error", message: message(error, t) };
  paths(locale, input.data.resourceId, input.data.locale);
  return { status: "success", message: t("saved") };
}

export async function updateResourceTranslation(
  locale: AppLocale,
  resourceId: string,
  translationLocale: "am" | "es",
  _state: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const t = await getTranslations({ locale, namespace: "resourceWorkflow" });
  const input = resourceTranslationUpdateSchema.safeParse({
    translationId: field(formData, "translationId"),
    expectedVersion: field(formData, "expectedVersion"),
    title: field(formData, "title"),
    summary: field(formData, "summary"),
    body: field(formData, "body"),
  });
  if (!input.success || !(await canManageTranslations()))
    return { status: "error", message: t("validationError") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("update_resource_translation_draft", {
    target_translation_id: input.data.translationId,
    expected_version: input.data.expectedVersion,
    input_title: input.data.title,
    input_summary: input.data.summary,
    input_body: input.data.body,
  });
  if (error) return { status: "error", message: message(error, t) };
  paths(locale, resourceId, translationLocale);
  return { status: "success", message: t("saved") };
}

async function transition(
  locale: AppLocale,
  resourceId: string,
  translationLocale: "am" | "es",
  rpc: "submit_resource_translation" | "withdraw_resource_translation" | "approve_resource_translation",
  _state: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const t = await getTranslations({ locale, namespace: "resourceWorkflow" });
  const input = resourceTranslationTransitionSchema.safeParse({
    translationId: field(formData, "translationId"),
    expectedVersion: field(formData, "expectedVersion"),
  });
  if (!input.success || !(await canManageTranslations()))
    return { status: "error", message: t("validationError") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc(rpc, {
    target_translation_id: input.data.translationId,
    expected_version: input.data.expectedVersion,
  });
  if (error) return { status: "error", message: message(error, t) };
  paths(locale, resourceId, translationLocale, rpc === "approve_resource_translation");
  return { status: "success", message: t("saved") };
}

export async function submitResourceTranslation(
  locale: AppLocale,
  resourceId: string,
  translationLocale: "am" | "es",
  state: ResourceActionState,
  formData: FormData,
) {
  return transition(locale, resourceId, translationLocale, "submit_resource_translation", state, formData);
}
export async function withdrawResourceTranslation(
  locale: AppLocale,
  resourceId: string,
  translationLocale: "am" | "es",
  state: ResourceActionState,
  formData: FormData,
) {
  return transition(locale, resourceId, translationLocale, "withdraw_resource_translation", state, formData);
}
export async function approveResourceTranslation(
  locale: AppLocale,
  resourceId: string,
  translationLocale: "am" | "es",
  state: ResourceActionState,
  formData: FormData,
) {
  return transition(locale, resourceId, translationLocale, "approve_resource_translation", state, formData);
}
export async function rejectResourceTranslation(
  locale: AppLocale,
  resourceId: string,
  translationLocale: "am" | "es",
  _state: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const t = await getTranslations({ locale, namespace: "resourceWorkflow" });
  const input = resourceTranslationRejectionSchema.safeParse({
    translationId: field(formData, "translationId"),
    expectedVersion: field(formData, "expectedVersion"),
    rejectionNote: field(formData, "rejectionNote"),
  });
  if (!input.success || !(await canManageTranslations()))
    return { status: "error", message: t("validationError") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("reject_resource_translation", {
    target_translation_id: input.data.translationId,
    expected_version: input.data.expectedVersion,
    input_rejection_note: input.data.rejectionNote,
  });
  if (error) return { status: "error", message: message(error, t) };
  paths(locale, resourceId, translationLocale);
  return { status: "success", message: t("saved") };
}
