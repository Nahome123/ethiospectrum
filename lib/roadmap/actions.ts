"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import {
  createRoadmapItemSchema,
  roadmapCreateSchema,
  roadmapDirectionSchema,
  roadmapExpectedVersionSchema,
  roadmapItemIdSchema,
} from "@/lib/validation/roadmap";
import type { RoadmapActionState } from "./action-state";
import { getRoadmapReschedulingContext } from "./scheduling";

function formValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

async function parseItem(locale: AppLocale, formData: FormData) {
  const t = await getTranslations({ locale, namespace: "roadmap" });
  return {
    t,
    result: createRoadmapItemSchema({
      title: t("titleError"),
      description: t("descriptionError"),
      date: t("dueDateError"),
    }).safeParse({
      title: formValue(formData, "title"),
      description: formValue(formData, "description"),
      category: formValue(formData, "category"),
      priority: formValue(formData, "priority"),
      status: formValue(formData, "status"),
      dueDate: formValue(formData, "dueDate"),
      dependentId: formValue(formData, "dependentId"),
      assignedTo: formValue(formData, "assignedTo"),
    }),
  };
}

function isStaleError(error: { code?: string } | null): boolean {
  return error?.code === "40001";
}

function revalidateRoadmap(locale: AppLocale, itemId?: string) {
  revalidatePath(`/${locale}/roadmap`);
  revalidatePath(`/${locale}/dashboard`);
  if (itemId) {
    revalidatePath(`/${locale}/roadmap/${itemId}`);
    revalidatePath(`/${locale}/roadmap/${itemId}/edit`);
  }
}

export async function createRoadmapItemAction(
  locale: AppLocale,
  _state: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const { t, result } = await parseItem(locale, formData);
  const creation = roadmapCreateSchema.safeParse({ idempotencyKey: formValue(formData, "idempotencyKey") });
  if (!result.success || !creation.success) return { status: "error", message: t("validationError") };

  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.rpc("create_roadmap_item", {
    input_title: result.data.title,
    input_description: result.data.description ?? undefined,
    input_category: result.data.category,
    input_priority: result.data.priority,
    input_status: result.data.status,
    input_due_date: result.data.dueDate ?? undefined,
    input_dependent_id: result.data.dependentId ?? undefined,
    input_assigned_to: result.data.assignedTo ?? undefined,
    input_idempotency_key: creation.data.idempotencyKey,
  });
  const itemId = data?.[0]?.id;
  if (error || !itemId) return { status: "error", message: t("createError") };

  revalidateRoadmap(locale, itemId);
  redirect(`/${locale}/roadmap/${itemId}`);
}

export async function updateRoadmapItemAction(
  locale: AppLocale,
  itemId: string,
  _state: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const { t, result } = await parseItem(locale, formData);
  const id = roadmapItemIdSchema.safeParse(itemId);
  const expected = roadmapExpectedVersionSchema.safeParse({
    expectedUpdatedAt: formValue(formData, "expectedUpdatedAt"),
  });
  if (!result.success || !id.success || !expected.success)
    return { status: "error", message: t("validationError") };

  const supabase = await createServerActionSupabaseClient();
  const rescheduling = await getRoadmapReschedulingContext(supabase, id.data, result.data.dueDate);
  if (rescheduling.schedules === null) return { status: "error", message: t("updateError") };
  const updateArgs = {
    target_item_id: id.data,
    expected_updated_at: expected.data.expectedUpdatedAt,
    input_title: result.data.title,
    input_description: result.data.description ?? undefined,
    input_category: result.data.category,
    input_priority: result.data.priority,
    input_status: result.data.status,
    input_due_date: result.data.dueDate ?? undefined,
    input_dependent_id: result.data.dependentId ?? undefined,
    input_assigned_to: result.data.assignedTo ?? undefined,
  };
  const { error } = rescheduling.dueDateChanged
    ? await supabase.rpc("update_roadmap_item_and_reschedule_reminders", {
        ...updateArgs,
        input_reminder_schedules: rescheduling.schedules,
      })
    : await supabase.rpc("update_roadmap_item", updateArgs);
  if (error) {
    return { status: "error", message: isStaleError(error) ? t("staleError") : t("updateError") };
  }

  revalidateRoadmap(locale, id.data);
  redirect(`/${locale}/roadmap/${id.data}`);
}

export async function archiveRoadmapItemAction(
  locale: AppLocale,
  itemId: string,
  _state: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const t = await getTranslations({ locale, namespace: "roadmap" });
  const id = roadmapItemIdSchema.safeParse(itemId);
  const expected = roadmapExpectedVersionSchema.safeParse({
    expectedUpdatedAt: formValue(formData, "expectedUpdatedAt"),
  });
  if (!id.success || !expected.success) return { status: "error", message: t("validationError") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("archive_roadmap_item", {
    target_item_id: id.data,
    expected_updated_at: expected.data.expectedUpdatedAt,
  });
  if (error) return { status: "error", message: isStaleError(error) ? t("staleError") : t("archiveError") };
  revalidateRoadmap(locale, id.data);
  redirect(`/${locale}/roadmap`);
}

export async function restoreRoadmapItemAction(
  locale: AppLocale,
  itemId: string,
  _state: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const t = await getTranslations({ locale, namespace: "roadmap" });
  const id = roadmapItemIdSchema.safeParse(itemId);
  const expected = roadmapExpectedVersionSchema.safeParse({
    expectedUpdatedAt: formValue(formData, "expectedUpdatedAt"),
  });
  if (!id.success || !expected.success) return { status: "error", message: t("validationError") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("restore_roadmap_item", {
    target_item_id: id.data,
    expected_updated_at: expected.data.expectedUpdatedAt,
  });
  if (error) return { status: "error", message: isStaleError(error) ? t("staleError") : t("restoreError") };
  revalidateRoadmap(locale, id.data);
  redirect(`/${locale}/roadmap/${id.data}`);
}

export async function reorderRoadmapItemsAction(
  locale: AppLocale,
  itemId: string,
  direction: "up" | "down",
  _state: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const t = await getTranslations({ locale, namespace: "roadmap" });
  const id = roadmapItemIdSchema.safeParse(itemId);
  const requestedDirection = roadmapDirectionSchema.safeParse(direction);
  const expected = roadmapExpectedVersionSchema.safeParse({
    expectedUpdatedAt: formValue(formData, "expectedUpdatedAt"),
  });
  if (!id.success || !requestedDirection.success || !expected.success) {
    return { status: "error", message: t("validationError") };
  }
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("reorder_roadmap_items", {
    target_item_id: id.data,
    expected_updated_at: expected.data.expectedUpdatedAt,
    input_direction: requestedDirection.data,
  });
  if (error) return { status: "error", message: isStaleError(error) ? t("staleError") : t("reorderError") };
  revalidateRoadmap(locale);
  return { status: "success", message: t("reorderSuccess") };
}
