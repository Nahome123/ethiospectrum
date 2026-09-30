"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { AppLocale } from "@/i18n/routing";
import { serviceErrorKey, type ServiceActionState } from "@/lib/services/action-state";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";

const TRAINING_MEDIA_BUCKET = "training-media";
const statusSchema = z.enum(["draft", "published", "archived"]);
const entitySchema = z.enum(["course", "module", "lesson"]);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function localized(formData: FormData, fields: readonly string[]) {
  const payload: Record<string, Record<string, string>> = {};
  for (const locale of ["am", "es"] as const) {
    const entry: Record<string, string> = {};
    for (const name of fields) {
      const value = field(formData, `${locale}.${name}`)
        .trim()
        .slice(0, name === "body" ? 20000 : 4000);
      if (value) entry[name] = value;
    }
    if (Object.keys(entry).length) payload[locale] = entry;
  }
  return payload;
}

async function done(
  locale: AppLocale,
  error: { code?: string } | null,
  successKey: string,
): Promise<ServiceActionState> {
  if (error) {
    const t = await getTranslations({ locale, namespace: "services.errors" });
    return { status: "error", message: t(serviceErrorKey(error.code)) };
  }
  revalidatePath(`/${locale}/admin/training`, "layout");
  revalidatePath(`/${locale}/training`, "layout");
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  return { status: "success", message: t(successKey) };
}

async function invalid(locale: AppLocale): Promise<ServiceActionState> {
  const t = await getTranslations({ locale, namespace: "services.errors" });
  return { status: "error", message: t("validation") };
}

const optionalId = z.union([z.uuid(), z.literal("").transform(() => null)]);
const title = z.string().trim().min(2).max(160);
const description = z.string().trim().max(4000);

export async function saveTrainingCourseAction(
  locale: AppLocale,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = z
    .object({
      id: optionalId,
      slug: z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
      title,
      description,
      status: statusSchema,
    })
    .safeParse({
      id: field(formData, "id"),
      slug: field(formData, "slug"),
      title: field(formData, "title"),
      description: field(formData, "description"),
      status: field(formData, "status"),
    });
  if (!parsed.success) return invalid(locale);
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("admin_save_training_course", {
    input_slug: parsed.data.slug,
    input_title: parsed.data.title,
    input_status: parsed.data.status,
    input_description: parsed.data.description || undefined,
    input_localized: localized(formData, ["title", "description"]),
    target_course_id: parsed.data.id ?? undefined,
  });
  return done(locale, error, "courseSaved");
}

export async function saveTrainingModuleAction(
  locale: AppLocale,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = z
    .object({ id: optionalId, courseId: z.uuid(), title, description, status: statusSchema })
    .safeParse({
      id: field(formData, "id"),
      courseId: field(formData, "courseId"),
      title: field(formData, "title"),
      description: field(formData, "description"),
      status: field(formData, "status"),
    });
  if (!parsed.success) return invalid(locale);
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("admin_save_training_module", {
    target_course_id: parsed.data.courseId,
    input_title: parsed.data.title,
    input_status: parsed.data.status,
    input_description: parsed.data.description || undefined,
    input_localized: localized(formData, ["title", "description"]),
    target_module_id: parsed.data.id ?? undefined,
  });
  return done(locale, error, "moduleSaved");
}

export async function saveTrainingLessonAction(
  locale: AppLocale,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const httpsOrEmpty = z.union([z.url({ protocol: /^https$/ }).max(2048), z.literal("")]);
  const parsed = z
    .object({
      id: optionalId,
      moduleId: z.uuid(),
      title,
      description,
      body: z.string().trim().max(20000),
      videoUrl: httpsOrEmpty,
      resourceUrl: z.union([httpsOrEmpty, z.string().regex(/^\/training\/[a-z0-9/-]*$/)]),
      resourceLabel: z.string().trim().max(160),
      duration: z.union([z.coerce.number().int().min(1).max(600), z.literal("").transform(() => null)]),
      status: statusSchema,
    })
    .safeParse({
      id: field(formData, "id"),
      moduleId: field(formData, "moduleId"),
      title: field(formData, "title"),
      description: field(formData, "description"),
      body: field(formData, "body"),
      videoUrl: field(formData, "videoUrl").trim(),
      resourceUrl: field(formData, "resourceUrl").trim(),
      resourceLabel: field(formData, "resourceLabel"),
      duration: field(formData, "durationMinutes").trim(),
      status: field(formData, "status"),
    });
  if (!parsed.success) return invalid(locale);
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("admin_save_training_lesson", {
    target_module_id: parsed.data.moduleId,
    input_title: parsed.data.title,
    input_status: parsed.data.status,
    input_description: parsed.data.description || undefined,
    input_body: parsed.data.body || undefined,
    input_localized: localized(formData, ["title", "description", "body"]),
    input_video_url: parsed.data.videoUrl || undefined,
    input_resource_url: parsed.data.resourceUrl || undefined,
    input_resource_label: parsed.data.resourceLabel || undefined,
    input_duration_minutes: parsed.data.duration ?? undefined,
    target_lesson_id: parsed.data.id ?? undefined,
  });
  return done(locale, error, "lessonSaved");
}

export async function setTrainingStatusAction(
  locale: AppLocale,
  entity: string,
  id: string,
  status: string,
  _formData: FormData,
): Promise<void> {
  void _formData;
  const parsed = z
    .object({ entity: entitySchema, id: z.uuid(), status: statusSchema })
    .safeParse({ entity, id, status });
  if (!parsed.success) return;
  const supabase = await createServerActionSupabaseClient();
  await supabase.rpc("admin_set_training_status", {
    input_entity: parsed.data.entity,
    target_id: parsed.data.id,
    input_status: parsed.data.status,
  });
  revalidatePath(`/${locale}/admin/training`, "layout");
  revalidatePath(`/${locale}/training`, "layout");
}

export async function moveTrainingItemAction(
  locale: AppLocale,
  entity: string,
  id: string,
  direction: string,
  _formData: FormData,
): Promise<void> {
  void _formData;
  const parsed = z
    .object({ entity: entitySchema, id: z.uuid(), direction: z.enum(["up", "down"]) })
    .safeParse({ entity, id, direction });
  if (!parsed.success) return;
  const supabase = await createServerActionSupabaseClient();
  await supabase.rpc("admin_move_training_item", {
    input_entity: parsed.data.entity,
    target_id: parsed.data.id,
    input_direction: parsed.data.direction,
  });
  revalidatePath(`/${locale}/admin/training`, "layout");
  revalidatePath(`/${locale}/training`, "layout");
}

export type MediaUploadState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; path: string; token: string };

/**
 * Derives the private object path for an uploaded lesson video or resource and
 * returns a signed upload token. Storage policy admits administrators only.
 */
export async function prepareTrainingMediaUploadAction(
  locale: AppLocale,
  lessonId: string,
  kind: "video" | "resource",
  filename: string,
): Promise<MediaUploadState> {
  const t = await getTranslations({ locale, namespace: "services.errors" });
  if (!z.uuid().safeParse(lessonId).success || !["video", "resource"].includes(kind)) {
    return { status: "error", message: t("validation") };
  }
  const supabase = await createServerActionSupabaseClient();
  const { data: path, error } = await supabase.rpc("admin_attach_training_media", {
    target_lesson_id: lessonId,
    input_media_kind: kind,
    input_filename: filename,
  });
  if (error || !path) return { status: "error", message: t(serviceErrorKey(error?.code)) };
  const signed = await supabase.storage
    .from(TRAINING_MEDIA_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (signed.error || !signed.data) return { status: "error", message: t("generic") };
  return { status: "ready", path, token: signed.data.token };
}

export async function finishTrainingMediaUploadAction(locale: AppLocale, lessonId: string): Promise<void> {
  if (!z.uuid().safeParse(lessonId).success) return;
  revalidatePath(`/${locale}/admin/training`, "layout");
  revalidatePath(`/${locale}/training/lessons/${lessonId}`);
}
