import "server-only";
import { redirect } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const TRAINING_MEDIA_BUCKET = "training-media";

type Functions = Database["public"]["Functions"];
export type TrainingOutlineRow = Functions["get_training_outline"]["Returns"][number];
export type TrainingProgressSummary = Functions["get_training_progress_summary"]["Returns"][number];
export type TrainingLesson = Database["public"]["Tables"]["training_lessons"]["Row"];
export type TrainingModule = Database["public"]["Tables"]["training_modules"]["Row"];
export type TrainingCourse = Database["public"]["Tables"]["training_courses"]["Row"];

export type TrainingAccess = {
  hasAccess: boolean;
  hasSubscription: boolean;
  canSubscribe: boolean;
  isAdministrator: boolean;
};

export async function getTrainingAccess(): Promise<TrainingAccess> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_training_access");
  const row = data?.[0];
  if (error || !row)
    return { hasAccess: false, hasSubscription: false, canSubscribe: false, isAdministrator: false };
  return {
    hasAccess: row.has_access,
    hasSubscription: row.has_subscription,
    canSubscribe: row.can_subscribe,
    isAdministrator: row.is_administrator,
  };
}

/** Protected RBT content requires an active subscription (PRD section 9). */
export async function requireTrainingAccess(locale: AppLocale): Promise<TrainingAccess> {
  const access = await getTrainingAccess();
  if (!access.hasAccess) redirect(`/${locale}/training`);
  return access;
}

export type Learner = { type: "member" } | { type: "dependent"; dependentId: string };

export function parseLearner(value: string | string[] | undefined): Learner {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && /^[0-9a-f-]{36}$/i.test(raw)) return { type: "dependent", dependentId: raw };
  return { type: "member" };
}

export async function getTrainingOutline(learner: Learner): Promise<TrainingOutlineRow[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_training_outline", {
    input_learner_type: learner.type,
    input_dependent_id: learner.type === "dependent" ? learner.dependentId : undefined,
  });
  return error || !data ? [] : data;
}

export async function getTrainingProgressSummary(): Promise<TrainingProgressSummary[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_training_progress_summary");
  return error || !data ? [] : data;
}

export type LessonDetail = {
  lesson: TrainingLesson;
  videoSrc: string | null;
  videoEmbed: string | null;
  resourceHref: string | null;
};

/** Converts a YouTube or Vimeo watch URL into a privacy-preserving embed URL. */
export function toVideoEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v");
      return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1);
      return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return /^\d{3,15}$/.test(id) ? `https://player.vimeo.com/video/${id}?dnt=1` : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Loads a published lesson through RLS (so it is null without a subscription)
 * and issues short-lived signed URLs for privately stored media.
 */
export async function getLessonDetail(lessonId: string): Promise<LessonDetail | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data: lesson, error } = await supabase
    .from("training_lessons")
    .select("*")
    .eq("id", lessonId)
    .maybeSingle();
  if (error || !lesson || lesson.status !== "published") return null;

  let videoSrc: string | null = null;
  let videoEmbed: string | null = null;
  if (lesson.video_storage_path) {
    const signed = await supabase.storage
      .from(TRAINING_MEDIA_BUCKET)
      .createSignedUrl(lesson.video_storage_path, 3600);
    videoSrc = signed.data?.signedUrl ?? null;
  } else if (lesson.video_url) {
    videoEmbed = toVideoEmbed(lesson.video_url);
    if (!videoEmbed && /\.(mp4|webm|m4v)(\?|$)/i.test(lesson.video_url)) videoSrc = lesson.video_url;
  }

  let resourceHref: string | null = null;
  if (lesson.resource_storage_path) {
    const signed = await supabase.storage
      .from(TRAINING_MEDIA_BUCKET)
      .createSignedUrl(lesson.resource_storage_path, 600, { download: true });
    resourceHref = signed.data?.signedUrl ?? null;
  } else if (lesson.resource_url) {
    resourceHref = lesson.resource_url;
  }
  return { lesson, videoSrc, videoEmbed, resourceHref };
}

/** Administrator content tree, including drafts and archived items. */
export async function getAdminTrainingTree() {
  const supabase = await createServerComponentSupabaseClient();
  const [courses, modules, lessons] = await Promise.all([
    supabase.from("training_courses").select("*").order("sequence").order("title"),
    supabase.from("training_modules").select("*").order("sequence").order("title"),
    supabase.from("training_lessons").select("*").order("sequence").order("title"),
  ]);
  return {
    courses: courses.data ?? [],
    modules: modules.data ?? [],
    lessons: lessons.data ?? [],
  };
}

export async function getAdminLesson(lessonId: string): Promise<TrainingLesson | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase.from("training_lessons").select("*").eq("id", lessonId).maybeSingle();
  return data;
}

/** Picks a localized field with English fallback from `{am: {title}, es: {...}}`. */
export function localizedField(
  localized: unknown,
  locale: string,
  fieldName: string,
  fallback: string | null,
): string | null {
  if (locale !== "en" && localized && typeof localized === "object" && !Array.isArray(localized)) {
    const entry = (localized as Record<string, unknown>)[locale];
    if (entry && typeof entry === "object") {
      const value = (entry as Record<string, unknown>)[fieldName];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return fallback;
}
