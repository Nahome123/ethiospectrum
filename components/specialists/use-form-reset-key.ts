"use client";

import { useEffect, useRef, useState } from "react";

/**
 * React resets a form after its action finishes, which snaps drop-downs to
 * their first option even though state still holds the chosen value. Returns
 * a ref for an element inside the form and a key that changes on each reset;
 * keying the fields with it remounts them showing the current state.
 */
export function useFormResetKey<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    // Remount after the browser finishes restoring default values.
    const onReset = () => setTimeout(() => setKey((current) => current + 1));
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  return [ref, key] as const;
}
