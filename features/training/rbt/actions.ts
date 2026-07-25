"use server";

import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { normalizeRbtProgress } from "./helpers";
import { rbtSectionSchema } from "./schema";
import type { TrainingProgress } from "./types";

const emptyProgress: TrainingProgress = {
  completedSections: [],
  lastSection: null,
  completedAt: null,
};

async function recordProgress(sectionInput: unknown, markCompleted: boolean): Promise<TrainingProgress> {
  const parsed = rbtSectionSchema.safeParse(sectionInput);
  if (!parsed.success) return emptyProgress;

  if (!(await getAuthenticatedUser())) return emptyProgress;

  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.rpc("record_training_progress", {
    mark_completed: markCompleted,
    target_section: parsed.data,
  });
  const progress = data?.[0];
  if (error || !progress) throw new Error("Unable to save training progress.");

  return normalizeRbtProgress({
    completedSections: progress.completed_sections,
    lastSection: progress.last_section,
    completedAt: progress.completed_at,
  });
}

export async function recordRbtSectionViewAction(sectionInput: unknown): Promise<TrainingProgress> {
  return recordProgress(sectionInput, false);
}

export async function markRbtSectionCompleteAction(sectionInput: unknown): Promise<TrainingProgress> {
  return recordProgress(sectionInput, true);
}
