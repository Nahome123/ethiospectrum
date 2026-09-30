"use client";

import { useEffect, useRef } from "react";
import type { AppLocale } from "@/i18n/routing";
import { recordLessonProgressAction } from "@/lib/training/actions";

type Props = {
  locale: AppLocale;
  lessonId: string;
  learner: string;
  title: string;
  videoSrc: string | null;
  videoEmbed: string | null;
  initialPercentage: number;
};

/**
 * Plays a lesson video. Uploaded/HTTPS files report watched progress in 10%
 * steps and completion at the end; embedded players record that the lesson
 * was started, and completion is marked explicitly by the learner.
 */
export function LessonPlayer({
  locale,
  lessonId,
  learner,
  title,
  videoSrc,
  videoEmbed,
  initialPercentage,
}: Props) {
  const reported = useRef(initialPercentage);

  useEffect(() => {
    if (initialPercentage === 0) {
      void recordLessonProgressAction(locale, { lessonId, learner, percentage: 1, completed: false });
      reported.current = 1;
    }
  }, [initialPercentage, learner, lessonId, locale]);

  if (videoEmbed) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <iframe
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="size-full"
          referrerPolicy="strict-origin-when-cross-origin"
          src={videoEmbed}
          title={title}
        />
      </div>
    );
  }
  if (!videoSrc) return null;
  return (
    <video
      className="aspect-video w-full rounded-2xl bg-black"
      controls
      controlsList="nodownload"
      onEnded={() => {
        reported.current = 100;
        void recordLessonProgressAction(locale, { lessonId, learner, percentage: 100, completed: true });
      }}
      onTimeUpdate={(event) => {
        const video = event.currentTarget;
        if (!video.duration || !Number.isFinite(video.duration)) return;
        const percentage = Math.floor(((video.currentTime / video.duration) * 100) / 10) * 10;
        if (percentage > reported.current && percentage < 100) {
          reported.current = percentage;
          void recordLessonProgressAction(locale, { lessonId, learner, percentage, completed: false });
        }
      }}
      preload="metadata"
      src={videoSrc}
    >
      <track kind="captions" />
    </video>
  );
}
