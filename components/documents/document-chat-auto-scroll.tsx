"use client";

import { useEffect, useRef } from "react";

/** Keeps the newest response discoverable without forcing motion-sensitive users to animate. */
export function DocumentChatAutoScroll({ messageCount }: { messageCount: number }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" });
  }, [messageCount]);
  return <div ref={target} />;
}
