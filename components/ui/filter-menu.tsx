"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type FilterMenuOption = {
  key: string;
  label: string;
  href: string;
  count?: number | null;
  active: boolean;
};

export type FilterMenuGroup = { label?: string; options: FilterMenuOption[] };

/**
 * A button that reveals less common filters, optionally in labeled groups.
 * Closes on outside click, Escape, or choosing an option.
 */
export function FilterMenu({
  activeCount = 0,
  columns = 1,
  groups,
  label,
  prefix,
}: {
  activeCount?: number;
  columns?: 1 | 2;
  groups: FilterMenuGroup[];
  label: string;
  /** Small muted text before the label, e.g. "Service". */
  prefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#c9d6e1] bg-card px-3.5 text-sm font-semibold transition-colors hover:border-link/50 hover:bg-tint"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {prefix ? <span className="font-medium text-muted-foreground">{prefix}</span> : null}
        {label}
        {activeCount > 0 ? (
          <span className="rounded-full bg-[#fdebdd] px-2 py-px text-xs font-bold text-[#c2450a]">
            {activeCount}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div
          className={cn(
            "absolute right-0 z-30 mt-2 rounded-xl border border-border bg-popover p-3 shadow-[0_16px_40px_rgba(24,41,59,0.14)]",
            columns === 2 ? "w-[min(30rem,calc(100vw-2rem))] sm:grid sm:grid-cols-2 sm:gap-x-4" : "w-64",
          )}
          id={menuId}
        >
          {groups.map((group, index) => (
            <div key={group.label ?? index}>
              {group.label ? (
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {group.label}
                </p>
              ) : null}
              <ul>
                {group.options.map((option) => (
                  <li key={option.key}>
                    <Link
                      aria-current={option.active ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-tint",
                        option.active && "bg-tint font-semibold",
                      )}
                      href={option.href}
                      onClick={() => setOpen(false)}
                    >
                      {option.label}
                      {option.count ? (
                        <span className="rounded-full bg-secondary px-2 py-px text-xs font-bold text-link">
                          {option.count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
