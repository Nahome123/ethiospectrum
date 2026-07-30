"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import {
  resourceCreateSchema,
  resourceRejectionSchema,
  resourceTransitionSchema,
  resourceUpdateSchema,
} from "@/lib/validation/resources";
import type { ResourceActionState } from "./action-state";

function value(data: FormData, name: string): string {
  return String(data.get(name) ?? "");
}

async function canManage(): Promise<boolean> {
  const user = await getAuthenticatedUser();
  return Boolean(user && (user.role === "content_editor" || user.role === "administrator"));
}

function paths(locale: AppLocale, id?: string) {
  revalidatePath(`/${locale}/resources`);
  revalidatePath(`/${locale}/editor/resources`);
  if (id) revalidatePath(`/${locale}/editor/resources/${id}`);
}

function stale(error: { code?: string } | null) {
  return error?.code === "40001";
}

export async function createResource(
  locale: AppLocale,
  _state: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const t = await getTranslations({ locale, namespace: "resources" });
  const input = resourceCreateSchema.safeParse({
    slug: value(formData, "slug"),
    category: value(formData, "category"),
    title: value(formData, "title"),
    summary: value(formData, "summary"),
    body: value(formData, "body"),
    idempotencyKey: value(formData, "idempotencyKey"),
  });
  if (!input.success || !(await canManage())) return { status: "error", message: t("validationError") };
  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.rpc("create_resource_draft", {
    input_slug: input.data.slug,
    input_category: input.data.category,
    input_title: input.data.title,
    input_summary: input.data.summary,
    input_body: input.data.body,
    input_idempotency_key: input.data.idempotencyKey,
  });
  const id = data?.[0]?.resource_id;
  if (error || !id) return { status: "error", message: t("saveError") };
  paths(locale, id);
  redirect(`/${locale}/editor/resources/${id}`);
}

export async function updateResource(
  locale: AppLocale,
  resourceId: string,
  _state: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const t = await getTranslations({ locale, namespace: "resources" });
  const input = resourceUpdateSchema.safeParse({
    slug: value(formData, "slug"),
    category: value(formData, "category"),
    title: value(formData, "title"),
    summary: value(formData, "summary"),
    body: value(formData, "body"),
    expectedVersion: value(formData, "expectedVersion"),
  });
  if (!input.success || !(await canManage())) return { status: "error", message: t("validationError") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("update_resource_draft", {
    target_resource_id: resourceId,
    expected_version: input.data.expectedVersion,
    input_slug: input.data.slug,
    input_category: input.data.category,
    input_title: input.data.title,
    input_summary: input.data.summary,
    input_body: input.data.body,
  });
  if (error) return { status: "error", message: stale(error) ? t("staleError") : t("saveError") };
  paths(locale, resourceId);
  redirect(`/${locale}/editor/resources/${resourceId}`);
}

type TransitionName =
  | "submit_resource_for_review"
  | "withdraw_resource_review"
  | "approve_resource"
  | "publish_resource"
  | "unpublish_resource"
  | "archive_resource"
  | "restore_resource";
async function transition(
  locale: AppLocale,
  resourceId: string,
  rpc: TransitionName,
  state: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const t = await getTranslations({ locale, namespace: "resources" });
  const input = resourceTransitionSchema.safeParse({
    resourceId,
    expectedVersion: value(formData, "expectedVersion"),
  });
  if (!input.success || !(await canManage())) return { status: "error", message: t("validationError") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc(rpc, {
    target_resource_id: input.data.resourceId,
    expected_version: input.data.expectedVersion,
  });
  if (error) return { status: "error", message: stale(error) ? t("staleError") : t("transitionError") };
  paths(locale, resourceId);
  return { status: "success", message: t("saved") };
}
export async function submitResourceForReview(
  locale: AppLocale,
  id: string,
  state: ResourceActionState,
  data: FormData,
): Promise<ResourceActionState> {
  return transition(locale, id, "submit_resource_for_review", state, data);
}
export async function withdrawResourceReview(
  locale: AppLocale,
  id: string,
  state: ResourceActionState,
  data: FormData,
): Promise<ResourceActionState> {
  return transition(locale, id, "withdraw_resource_review", state, data);
}
export async function approveResource(
  locale: AppLocale,
  id: string,
  state: ResourceActionState,
  data: FormData,
): Promise<ResourceActionState> {
  return transition(locale, id, "approve_resource", state, data);
}
export async function publishResource(
  locale: AppLocale,
  id: string,
  state: ResourceActionState,
  data: FormData,
): Promise<ResourceActionState> {
  return transition(locale, id, "publish_resource", state, data);
}
export async function unpublishResource(
  locale: AppLocale,
  id: string,
  state: ResourceActionState,
  data: FormData,
): Promise<ResourceActionState> {
  return transition(locale, id, "unpublish_resource", state, data);
}
export async function archiveResource(
  locale: AppLocale,
  id: string,
  state: ResourceActionState,
  data: FormData,
): Promise<ResourceActionState> {
  return transition(locale, id, "archive_resource", state, data);
}
export async function restoreResource(
  locale: AppLocale,
  id: string,
  state: ResourceActionState,
  data: FormData,
): Promise<ResourceActionState> {
  return transition(locale, id, "restore_resource", state, data);
}

export async function rejectResource(
  locale: AppLocale,
  resourceId: string,
  _state: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const t = await getTranslations({ locale, namespace: "resources" });
  const input = resourceRejectionSchema.safeParse({
    resourceId,
    expectedVersion: value(formData, "expectedVersion"),
    rejectionNote: value(formData, "rejectionNote"),
  });
  if (!input.success || !(await canManage())) return { status: "error", message: t("validationError") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("reject_resource", {
    target_resource_id: input.data.resourceId,
    expected_version: input.data.expectedVersion,
    input_rejection_note: input.data.rejectionNote,
  });
  if (error) return { status: "error", message: stale(error) ? t("staleError") : t("transitionError") };
  paths(locale, resourceId);
  return { status: "success", message: t("saved") };
}
