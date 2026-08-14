"use client";

import { useEffect, useState } from "react";

type ProgressSection = {
  id: string;
  status: string;
  title: string;
};

export function IepAccommodationsProgress({
  backToTop,
  contentsStatus,
  readingProgress,
  sections,
  title,
}: {
  backToTop: string;
  contentsStatus: string;
  readingProgress: string;
  sections: ProgressSection[];
  title: string;
}) {
  const [percentage, setPercentage] = useState(0);
  const [activeSection, setActiveSection] = useState(-1);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const nextPercentage = documentHeight > 0 ? Math.round((window.scrollY / documentHeight) * 100) : 100;
      setPercentage(Math.min(100, Math.max(0, nextPercentage)));

      let nextSection = -1;
      sections.forEach((section, index) => {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= 160) nextSection = index;
      });
      setActiveSection(nextSection);
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sections]);

  const current = activeSection >= 0 ? sections[activeSection] : null;

  return (
    <div className="sticky top-0 z-20 overflow-hidden rounded-xl border border-border bg-background/95 shadow-sm backdrop-blur">
      <div
        aria-label={readingProgress}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percentage}
        className="h-1 bg-muted"
        role="progressbar"
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
      <div className="flex min-h-12 items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-secondary-foreground">
            {current?.status ?? contentsStatus}
          </p>
          <p className="truncate text-sm font-semibold">{current?.title ?? title}</p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">{percentage}%</span>
        <button
          className="hidden min-h-10 rounded-full border border-border px-3 text-sm font-semibold hover:bg-muted sm:inline-flex sm:items-center"
          onClick={() =>
            window.scrollTo({
              behavior:
                typeof window.matchMedia === "function" &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
              top: 0,
            })
          }
          type="button"
        >
          {backToTop}
        </button>
      </div>
    </div>
  );
}
