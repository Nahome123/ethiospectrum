"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { loadDocumentCitationEvidenceAction } from "@/lib/documents/citation-actions";
import type { DocumentCitation, DocumentCitationEvidence } from "@/lib/documents/citations/types";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/i18n/routing";

export type CitationEvidenceLabels = {
  backToAnswer: string;
  citation: string;
  closeSource: string;
  excerptShortened: string;
  loadingSource: string;
  openOriginalPage: string;
  originalPageNavigationUnavailable: string;
  page: string;
  partialDocument: string;
  readOnlyEvidence: string;
  section: string;
  source: string;
  sourceDetails: string;
  sourceEvidence: string;
  sourceExcerpt: string;
  sourceMayHaveChanged: string;
  sourceUnavailable: string;
  tryAgain: string;
  verifyAgainstOriginal: string;
  viewSource: string;
  onlyProcessedContent: string;
};

function citationPath(citation: DocumentCitation, location: string): string {
  const url = new URL(location);
  url.searchParams.set("citationOwner", citation.ownerType);
  url.searchParams.set("ownerId", citation.ownerId);
  url.searchParams.set("citation", String(citation.citationIndex));
  return `${url.pathname}${url.search}${url.hash}`;
}

function citationFreePath(location: string): string {
  const url = new URL(location);
  url.searchParams.delete("citationOwner");
  url.searchParams.delete("ownerId");
  url.searchParams.delete("citation");
  return `${url.pathname}${url.search}${url.hash}`;
}

function isSelectedCitation(citation: DocumentCitation, search: URLSearchParams): boolean {
  return (
    search.get("citationOwner") === citation.ownerType &&
    search.get("ownerId") === citation.ownerId &&
    search.get("citation") === String(citation.citationIndex)
  );
}

function subscribeToLocation(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function locationSnapshot(): string {
  return window.location.href;
}

function serverLocationSnapshot(): string {
  return "";
}

export function CitationEvidenceTrigger({
  citation,
  className,
  labels,
  locale,
}: {
  citation: DocumentCitation;
  className?: string;
  labels: CitationEvidenceLabels;
  locale: AppLocale;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const [evidence, setEvidence] = useState<DocumentCitationEvidence | null>(null);
  const [isPending, startTransition] = useTransition();
  const location = useSyncExternalStore(subscribeToLocation, locationSnapshot, serverLocationSnapshot);
  const selected = location ? isSelectedCitation(citation, new URL(location).searchParams) : false;

  useEffect(() => {
    if (selected) {
      startTransition(async () => {
        setEvidence(await loadDocumentCitationEvidenceAction(citation));
      });
    } else if (wasOpenRef.current) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = selected;
  }, [citation, selected]);

  function openCitation() {
    window.history.pushState(null, "", citationPath(citation, window.location.href));
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function closeCitation() {
    if (!selected) return;
    window.history.replaceState(null, "", citationFreePath(window.location.href));
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function retry() {
    startTransition(async () => {
      setEvidence(await loadDocumentCitationEvidenceAction(citation));
    });
  }

  const sourceLabel = `${labels.viewSource}: ${labels.source} ${citation.sourceNumber}`;
  const pageOrSection =
    citation.sourceKind === "page" && citation.pageStart
      ? `${labels.page} ${citation.pageStart}`
      : citation.sourceKind === "section" && citation.sectionNumber
        ? `${labels.section} ${citation.sectionNumber}`
        : labels.sourceUnavailable;
  const viewerHref = `/${locale}/documents/${citation.documentId}/view?citationOwner=${encodeURIComponent(citation.ownerType)}&ownerId=${encodeURIComponent(citation.ownerId)}&citation=${String(citation.citationIndex)}`;

  return (
    <>
      <Button
        aria-haspopup="dialog"
        aria-label={sourceLabel}
        className={cn("h-8 rounded-full px-3 text-xs", className)}
        onClick={openCitation}
        ref={triggerRef}
        type="button"
        variant="outline"
      >
        {labels.source} {citation.sourceNumber}
        {citation.sourceKind && citation.availability !== "unavailable" ? ` · ${pageOrSection}` : ""}
      </Button>
      <Sheet onOpenChange={(open) => (!open ? closeCitation() : undefined)} open={selected}>
        <SheetContent
          className="w-full max-w-none overflow-y-auto sm:max-w-lg"
          showCloseButton={false}
          side="right"
        >
          <SheetHeader className="pr-14">
            <SheetTitle>{labels.sourceEvidence}</SheetTitle>
            <SheetDescription>{labels.readOnlyEvidence}</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 px-6 pb-8">
            {isPending || !evidence ? (
              <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
                {labels.loadingSource}
              </p>
            ) : evidence.availability === "unavailable" ? (
              <section aria-live="polite" className="rounded-xl border bg-muted/40 p-4" role="status">
                <h2 className="font-semibold">{labels.sourceUnavailable}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{labels.sourceMayHaveChanged}</p>
                <Button className="mt-4" onClick={retry} size="sm" type="button" variant="outline">
                  {labels.tryAgain}
                </Button>
              </section>
            ) : (
              <>
                <dl className="grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
                  <div>
                    <dt className="font-semibold">{labels.citation}</dt>
                    <dd className="mt-1">
                      {labels.source} {citation.sourceNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">{labels.sourceDetails}</dt>
                    <dd className="mt-1 break-words">{evidence.documentName}</dd>
                  </div>
                  {evidence.sourceKind === "page" && evidence.pageNumber ? (
                    <div>
                      <dt className="font-semibold">{labels.page}</dt>
                      <dd className="mt-1">{evidence.pageNumber}</dd>
                    </div>
                  ) : null}
                  {evidence.sourceKind === "section" && evidence.sectionNumber ? (
                    <div>
                      <dt className="font-semibold">{labels.section}</dt>
                      <dd className="mt-1">{evidence.sectionNumber}</dd>
                    </div>
                  ) : null}
                </dl>
                {evidence.isPartialDocument ? (
                  <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    <p className="font-semibold">{labels.partialDocument}</p>
                    <p className="mt-1">{labels.onlyProcessedContent}</p>
                  </aside>
                ) : null}
                <section aria-labelledby={`citation-excerpt-${citation.ownerId}-${citation.citationIndex}`}>
                  <h2
                    className="font-semibold"
                    id={`citation-excerpt-${citation.ownerId}-${citation.citationIndex}`}
                  >
                    {labels.sourceExcerpt}
                  </h2>
                  <p
                    className="mt-2 break-words whitespace-pre-wrap rounded-xl border bg-background p-4 text-sm"
                    lang={locale}
                  >
                    {evidence.excerpt}
                  </p>
                  {evidence.excerptShortened ? (
                    <p className="mt-2 text-sm text-muted-foreground">{labels.excerptShortened}</p>
                  ) : null}
                </section>
                {evidence.canOpenOriginal ? (
                  <a
                    className="inline-flex min-h-11 items-center justify-center rounded-4xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                    href={viewerHref}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {labels.openOriginalPage}
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">{labels.originalPageNavigationUnavailable}</p>
                )}
                <aside className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                  {labels.verifyAgainstOriginal}
                </aside>
              </>
            )}
          </div>
          <div className="sticky bottom-0 border-t bg-popover p-4">
            <SheetClose render={<Button className="w-full" type="button" variant="outline" />}>
              {labels.closeSource}
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
