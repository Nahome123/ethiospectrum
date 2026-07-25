"use client";

import { useState } from "react";
import { getRbtElementsByClass } from "@/features/training/rbt/helpers";
import type { RbtSourceElement } from "@/features/training/rbt/types";
import { Button } from "@/components/ui/button";
import { RbtSourceNodeRenderer } from "./rbt-source-node";

export function RbtFlashcardList({
  source,
  labels,
}: {
  source: RbtSourceElement;
  labels: { collapseAll: string; expandAll: string; hideAnswer: string; revealAnswer: string };
}) {
  const cards = getRbtElementsByClass(source, "qa-card");
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());
  const allExpanded = openCards.size === cards.length;

  function setAll(open: boolean) {
    setOpenCards(open ? new Set(cards.map((_, index) => index)) : new Set());
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-3">
        <Button onClick={() => setAll(true)} type="button" variant="outline">
          {labels.expandAll}
        </Button>
        <Button disabled={!openCards.size} onClick={() => setAll(false)} type="button" variant="outline">
          {labels.collapseAll}
        </Button>
      </div>
      {cards.map((card, index) => {
        const answerId = `rbt-flashcard-answer-${index}`;
        const expanded = openCards.has(index);
        const question = card.children.filter(
          (child) => child.kind === "element" && child.className === "qa-q",
        );
        const answers = card.children.filter(
          (child) => child.kind === "element" && child.className !== "qa-q",
        );
        return (
          <article className="mb-4 rounded-2xl border border-[#dde8e2] bg-white p-5 shadow-sm" key={answerId}>
            <div className="font-semibold text-foreground">
              {question.map((node, questionIndex) => (
                <RbtSourceNodeRenderer key={questionIndex} node={node} />
              ))}
            </div>
            <Button
              aria-controls={answerId}
              aria-expanded={expanded}
              className="mt-4"
              onClick={() => {
                setOpenCards((current) => {
                  const next = new Set(current);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                });
              }}
              type="button"
              variant="outline"
            >
              {expanded ? labels.hideAnswer : labels.revealAnswer}
            </Button>
            <div hidden={!expanded} id={answerId}>
              {answers.map((node, answerIndex) => (
                <RbtSourceNodeRenderer key={answerIndex} node={node} />
              ))}
            </div>
            <noscript>
              <div>
                {answers.map((node, answerIndex) => (
                  <RbtSourceNodeRenderer key={answerIndex} node={node} />
                ))}
              </div>
            </noscript>
          </article>
        );
      })}
      {allExpanded ? <p className="sr-only">{labels.collapseAll}</p> : null}
    </div>
  );
}
