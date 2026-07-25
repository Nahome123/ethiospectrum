import "server-only";

import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
import { normalizeRbtProgress } from "./helpers";
import type { TrainingProgress } from "./types";
import { rbtCourseKey } from "./constants";

const emptyProgress: TrainingProgress = {
  completedSections: [],
  lastSection: null,
  completedAt: null,
};

export async function getCurrentRbtTrainingProgress(userId: string): Promise<TrainingProgress> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("training_progress")
    .select("completed_sections, last_section, completed_at")
    .eq("user_id", userId)
    .eq("course_key", rbtCourseKey)
    .maybeSingle();

  if (error) throw new Error("Unable to load training progress.");
  if (!data) return emptyProgress;

  return normalizeRbtProgress({
    completedSections: data.completed_sections,
    lastSection: data.last_section,
    completedAt: data.completed_at,
  });
}
