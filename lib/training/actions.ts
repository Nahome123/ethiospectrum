"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";

const progressSchema = z.object({
  lessonId: z.uuid(),
  learner: z.union([z.literal("member"), z.uuid()]),
  percentage: z.coerce.number().int().min(0).max(100),
  completed: z.boolean(),
});

export type ProgressActionResult = { ok: boolean };

/** Records self-paced progress for the member or one household dependent. */
export async function recordLessonProgressAction(
  locale: AppLocale,
  input: { lessonId: string; learner: string; percentage: number; completed: boolean },
): Promise<ProgressActionResult> {
  const parsed = progressSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const supabase = await createServerActionSupabaseClient();
  const isMember = parsed.data.learner === "member";
  const { error } = await supabase.rpc("record_lesson_progress", {
    target_lesson_id: parsed.data.lessonId,
    input_learner_type: isMember ? "member" : "dependent",
    input_progress_percentage: parsed.data.percentage,
    input_completed: parsed.data.completed,
    input_dependent_id: isMember ? undefined : parsed.data.learner,
  });
  if (error) return { ok: false };
  if (parsed.data.completed) {
    revalidatePath(`/${locale}/training`);
    revalidatePath(`/${locale}/dashboard`);
  }
  return { ok: true };
}

export async function markLessonCompleteAction(
  locale: AppLocale,
  lessonId: string,
  learner: string,
  _formData: FormData,
): Promise<void> {
  void _formData;
  await recordLessonProgressAction(locale, { lessonId, learner, percentage: 100, completed: true });
  revalidatePath(`/${locale}/training/lessons/${lessonId}`);
}

export async function resetLessonProgressAction(
  locale: AppLocale,
  lessonId: string,
  learner: string,
  _formData: FormData,
): Promise<void> {
  void _formData;
  const lesson = z.uuid().safeParse(lessonId);
  const target = z.union([z.literal("member"), z.uuid()]).safeParse(learner);
  if (!lesson.success || !target.success) return;
  const supabase = await createServerActionSupabaseClient();
  await supabase.rpc("reset_lesson_progress", {
    target_lesson_id: lesson.data,
    input_learner_type: target.data === "member" ? "member" : "dependent",
    input_dependent_id: target.data === "member" ? undefined : target.data,
  });
  revalidatePath(`/${locale}/training`);
  revalidatePath(`/${locale}/training/lessons/${lesson.data}`);
}
