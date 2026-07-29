"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const DOCUMENT_STATUS_REFRESH_INTERVAL_MS = 10_000;

/** Refreshes a document screen only while its server-owned background work is pending. */
export function DocumentStatusRefresher({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    refreshWhenVisible();
    const interval = window.setInterval(refreshWhenVisible, DOCUMENT_STATUS_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [active, router]);

  return null;
}
