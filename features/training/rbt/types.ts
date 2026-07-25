export const rbtSectionIds = [
  "overview",
  "procedure",
  "errors",
  "setup",
  "flashcards",
  "glossary",
  "takeaways",
] as const;

export type RbtSectionId = (typeof rbtSectionIds)[number];

export type RbtSourceTag = "button" | "div" | "footer" | "h1" | "li" | "p" | "span" | "strong" | "u" | "ul";

export type RbtSourceNode = RbtSourceElement | RbtSourceText;

export type RbtSourceText = {
  kind: "text";
  value: string;
};

export type RbtSourceElement = {
  kind: "element";
  tag: RbtSourceTag;
  className?: string;
  id?: string;
  children: RbtSourceNode[];
};

export type RbtNavigationItem = {
  id: RbtSectionId;
  label: string;
};

export type RbtSectionSource = {
  id: RbtSectionId;
  node: RbtSourceElement;
};

export type RbtTrainingSource = {
  courseKey: "rbt-errorless-teaching-intensive-teaching";
  hero: RbtSourceElement;
  navigation: RbtNavigationItem[];
  sections: RbtSectionSource[];
  footer: RbtSourceElement;
};

export type TrainingProgress = {
  completedSections: RbtSectionId[];
  lastSection: RbtSectionId | null;
  completedAt: string | null;
};
