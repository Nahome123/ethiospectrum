import { RbtFlashcardList } from "@/components/training/rbt-flashcard-list";
import { RbtGlossaryList } from "@/components/training/rbt-glossary-list";
import { RbtSourceNodeRenderer } from "@/components/training/rbt-source-node";
import { rbtTrainingContent } from "@/features/training/rbt/content";
import type { RbtSectionId } from "@/features/training/rbt/types";

export function RbtTrainingHero() {
  return (
    <section className="[&_.am]:text-[#f0c84a] [&_.hero-sub_.am]:text-white/70">
      <RbtSourceNodeRenderer node={rbtTrainingContent.hero} />
    </section>
  );
}

export function RbtTrainingLesson({
  labels,
  section,
}: {
  labels: {
    collapseAll: string;
    expandAll: string;
    hideAnswer: string;
    noMatches: string;
    revealAnswer: string;
    searchGlossary: string;
  };
  section: RbtSectionId;
}) {
  const source = rbtTrainingContent.sections.find((item) => item.id === section);
  if (!source) return null;

  if (section === "flashcards") {
    return (
      <>
        <RbtSourceNodeRenderer node={source.node} omittedClasses={["qa-card"]} />
        <RbtFlashcardList
          labels={{
            collapseAll: labels.collapseAll,
            expandAll: labels.expandAll,
            hideAnswer: labels.hideAnswer,
            revealAnswer: labels.revealAnswer,
          }}
          source={source.node}
        />
      </>
    );
  }

  if (section === "glossary") {
    return (
      <>
        <RbtSourceNodeRenderer node={source.node} omittedClasses={["gloss-item"]} />
        <RbtGlossaryList
          labels={{ noMatches: labels.noMatches, search: labels.searchGlossary }}
          source={source.node}
        />
      </>
    );
  }

  return <RbtSourceNodeRenderer node={source.node} />;
}

export function RbtTrainingFooter() {
  return (
    <section className="mt-8 rounded-3xl bg-[#1a1a2e] p-6 text-center text-sm text-white/70 [&_.am]:mt-2 [&_.am]:block [&_.am]:text-white/70">
      <RbtSourceNodeRenderer node={rbtTrainingContent.footer} />
    </section>
  );
}
