"use client";

import { useEffect, useState } from "react";
import { markRbtSectionCompleteAction, recordRbtSectionViewAction } from "@/features/training/rbt/actions";
import {
  getRbtProgressPercentage,
  isRbtTrainingComplete,
  normalizeRbtProgress,
} from "@/features/training/rbt/helpers";
import type { RbtSectionId, TrainingProgress as TrainingProgressValue } from "@/features/training/rbt/types";
import { Button } from "@/components/ui/button";

export function TrainingProgress({
  initialProgress,
  labels,
  section,
}: {
  initialProgress: TrainingProgressValue;
  labels: {
    completed: string;
    complete: string;
    completedContent: string;
    inProgress: string;
    progress: string;
    unableToSave: string;
  };
  section: RbtSectionId;
}) {
  const [progress, setProgress] = useState(() => normalizeRbtProgress(initialProgress));
  const [saveError, setSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const completed = progress.completedSections.includes(section);
  const percentage = getRbtProgressPercentage(progress.completedSections);
  const allComplete = isRbtTrainingComplete(progress.completedSections);

  useEffect(() => {
    let active = true;
    void recordRbtSectionViewAction(section)
      .then((nextProgress) => {
        if (active) {
          setProgress(normalizeRbtProgress(nextProgress));
          setSaveError(false);
        }
      })
      .catch(() => {
        if (active) setSaveError(true);
      });
    return () => {
      active = false;
    };
  }, [section]);

  return (
    <aside aria-label={labels.progress} className="mb-6 rounded-3xl border border-[#b2d8c2] bg-[#e8f5ee] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-[#1a6b3c]">
            {labels.progress}: {percentage}%
          </p>
          <p aria-live="polite" className="mt-1 text-sm text-muted-foreground">
            {allComplete ? labels.completedContent : completed ? labels.completed : labels.inProgress}
          </p>
          {saveError ? (
            <p className="mt-1 text-sm text-destructive" role="alert">
              {labels.unableToSave}
            </p>
          ) : null}
        </div>
        <Button
          disabled={completed || isSaving}
          onClick={() => {
            setIsSaving(true);
            void markRbtSectionCompleteAction(section)
              .then((nextProgress) => {
                setProgress(normalizeRbtProgress(nextProgress));
                setSaveError(false);
              })
              .catch(() => setSaveError(true))
              .finally(() => setIsSaving(false));
          }}
          type="button"
        >
          {completed ? labels.completed : labels.complete}
        </Button>
      </div>
    </aside>
  );
}
