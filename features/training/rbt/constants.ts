import type { RbtSectionId } from "./types";

export const rbtCourseKey = "rbt-errorless-teaching-intensive-teaching" as const;

export const rbtRouteBySection: Record<RbtSectionId, string> = {
  overview: "overview",
  procedure: "procedure",
  errors: "error-correction",
  setup: "setup",
  flashcards: "flashcards",
  glossary: "glossary",
  takeaways: "takeaways",
};

export const rbtSectionByRoute = Object.fromEntries(
  Object.entries(rbtRouteBySection).map(([section, route]) => [route, section]),
) as Record<string, RbtSectionId>;
