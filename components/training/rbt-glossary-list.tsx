"use client";

import { useMemo, useState } from "react";
import { getRbtElementsByClass, getRbtNodeText } from "@/features/training/rbt/helpers";
import type { RbtSourceElement } from "@/features/training/rbt/types";
import { RbtSourceNodeRenderer } from "./rbt-source-node";

export function RbtGlossaryList({
  source,
  labels,
}: {
  source: RbtSourceElement;
  labels: { noMatches: string; search: string };
}) {
  const [query, setQuery] = useState("");
  const entries = getRbtElementsByClass(source, "gloss-item");
  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return entries;
    return entries.filter((entry) => getRbtNodeText(entry).toLocaleLowerCase().includes(normalizedQuery));
  }, [entries, query]);

  return (
    <div>
      <label className="mb-2 block text-sm font-semibold" htmlFor="rbt-glossary-search">
        {labels.search}
      </label>
      <input
        className="mb-5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        id="rbt-glossary-search"
        onChange={(event) => setQuery(event.target.value)}
        type="search"
        value={query}
      />
      {visibleEntries.length ? (
        visibleEntries.map((entry, index) => <RbtSourceNodeRenderer key={index} node={entry} />)
      ) : (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {labels.noMatches}
        </p>
      )}
    </div>
  );
}
