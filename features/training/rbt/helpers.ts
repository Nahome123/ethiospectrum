import {
  rbtSectionIds,
  type RbtSectionId,
  type RbtSourceElement,
  type RbtSourceNode,
  type TrainingProgress,
} from "./types";

const sectionIdSet = new Set<string>(rbtSectionIds);

export function isRbtSectionId(value: string): value is RbtSectionId {
  return sectionIdSet.has(value);
}

export function normalizeRbtCompletedSections(values: readonly string[]): RbtSectionId[] {
  return Array.from(new Set(values.filter(isRbtSectionId)));
}

export function getRbtProgressPercentage(completedSections: readonly string[]): number {
  return Math.round((normalizeRbtCompletedSections(completedSections).length / rbtSectionIds.length) * 100);
}

export function isRbtTrainingComplete(completedSections: readonly string[]): boolean {
  return normalizeRbtCompletedSections(completedSections).length === rbtSectionIds.length;
}

export function normalizeRbtProgress(progress: {
  completedSections: readonly string[];
  lastSection: string | null;
  completedAt: string | null;
}): TrainingProgress {
  const completedSections = normalizeRbtCompletedSections(progress.completedSections);
  return {
    completedSections,
    lastSection: progress.lastSection && isRbtSectionId(progress.lastSection) ? progress.lastSection : null,
    completedAt: isRbtTrainingComplete(completedSections) ? progress.completedAt : null,
  };
}

export function getRbtNodeText(node: RbtSourceNode): string {
  if (node.kind === "text") return node.value;
  return node.children.map(getRbtNodeText).join(" ").replace(/\s+/g, " ").trim();
}

export function getRbtElementsByClass(node: RbtSourceNode, className: string): RbtSourceElement[] {
  if (node.kind === "text") return [];
  const descendants = node.children.flatMap((child) => getRbtElementsByClass(child, className));
  return node.className === className ? [node, ...descendants] : descendants;
}
