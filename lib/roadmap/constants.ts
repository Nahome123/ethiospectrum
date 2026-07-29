export const roadmapCategoryValues = [
  "general",
  "healthcare",
  "education",
  "therapy",
  "benefits",
  "legal",
  "family_support",
  "other",
] as const;

export const roadmapPriorityValues = ["low", "medium", "high"] as const;

export const roadmapStatusValues = [
  "not_started",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;

export const roadmapSortValues = ["manual", "due_date", "priority", "updated", "created"] as const;
export const roadmapAssigneeFilterValues = ["all", "me", "unassigned"] as const;

export type RoadmapCategory = (typeof roadmapCategoryValues)[number];
export type RoadmapPriority = (typeof roadmapPriorityValues)[number];
export type RoadmapStatus = (typeof roadmapStatusValues)[number];
export type RoadmapSort = (typeof roadmapSortValues)[number];
export type RoadmapAssigneeFilter = (typeof roadmapAssigneeFilterValues)[number];

export const roadmapStatusTransitions: Readonly<Record<RoadmapStatus, readonly RoadmapStatus[]>> = {
  not_started: ["in_progress", "blocked", "completed", "cancelled"],
  in_progress: ["not_started", "blocked", "completed", "cancelled"],
  blocked: ["not_started", "in_progress", "completed", "cancelled"],
  completed: ["not_started", "in_progress"],
  cancelled: ["not_started"],
};

export const ROADMAP_PAGE_SIZE = 20;
