import type { TrainingOutlineRow } from "@/lib/training/server";

export type GuideStop = {
  lessonId: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
  href: string;
};

export type GuideSequence = {
  modules: { id: string; title: string; href: string }[];
  currentModuleId: string | null;
  previous: GuideStop | null;
  next: GuideStop | null;
};

/** A lesson's guide route; it forwards to the RBT guide or the lesson when it has no guide text. */
export const lessonGuideHref = (lessonId: string) => `/training/lessons/${lessonId}/guide`;

/**
 * Where the study guides go next, from the training outline (already in
 * course, module and lesson order): every module's first lesson, and the
 * lessons before and after the current one, across module boundaries.
 */
export function buildGuideSequence(
  outline: TrainingOutlineRow[],
  currentLessonId: string | null | undefined,
  localize: (localized: unknown, fallback: string) => string,
): GuideSequence {
  const stop = (row: TrainingOutlineRow | undefined): GuideStop | null =>
    row
      ? {
          lessonId: row.lesson_id,
          title: localize(row.lesson_localized, row.lesson_title),
          moduleId: row.module_id,
          moduleTitle: localize(row.module_localized, row.module_title),
          href: lessonGuideHref(row.lesson_id),
        }
      : null;

  const modules: GuideSequence["modules"] = [];
  for (const row of outline) {
    if (!modules.some((module) => module.id === row.module_id)) {
      modules.push({
        id: row.module_id,
        title: localize(row.module_localized, row.module_title),
        href: lessonGuideHref(row.lesson_id),
      });
    }
  }

  const index = currentLessonId ? outline.findIndex((row) => row.lesson_id === currentLessonId) : -1;
  return {
    modules,
    currentModuleId: index >= 0 ? outline[index].module_id : null,
    previous: index > 0 ? stop(outline[index - 1]) : null,
    next: index >= 0 ? stop(outline[index + 1]) : null,
  };
}
