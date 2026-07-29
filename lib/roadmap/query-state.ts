import { z } from "zod";
import {
  roadmapAssigneeFilterValues,
  roadmapCategoryValues,
  roadmapPriorityValues,
  roadmapSortValues,
  roadmapStatusValues,
  type RoadmapAssigneeFilter,
  type RoadmapCategory,
  type RoadmapPriority,
  type RoadmapSort,
  type RoadmapStatus,
} from "./constants";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const querySchema = z.object({
  archived: z.enum(["0", "1"]).optional().default("0"),
  assignee: z.enum(roadmapAssigneeFilterValues).optional().default("all"),
  status: z.enum(roadmapStatusValues).optional(),
  priority: z.enum(roadmapPriorityValues).optional(),
  category: z.enum(roadmapCategoryValues).optional(),
  dependent: z.uuid().optional(),
  overdue: z.enum(["0", "1"]).optional().default("0"),
  completed: z.enum(["0", "1"]).optional().default("0"),
  sort: z.enum(roadmapSortValues).optional().default("manual"),
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
});

export type RoadmapQueryState = {
  archived: boolean;
  assignee: RoadmapAssigneeFilter;
  status?: RoadmapStatus;
  priority?: RoadmapPriority;
  category?: RoadmapCategory;
  dependent?: string;
  overdue: boolean;
  completed: boolean;
  sort: RoadmapSort;
  page: number;
};

export function parseRoadmapQuery(value: Record<string, string | string[] | undefined>): RoadmapQueryState {
  const result = querySchema.safeParse({
    archived: first(value.archived),
    assignee: first(value.assignee),
    status: first(value.status),
    priority: first(value.priority),
    category: first(value.category),
    dependent: first(value.dependent),
    overdue: first(value.overdue),
    completed: first(value.completed),
    sort: first(value.sort),
    page: first(value.page),
  });
  const data = result.success ? result.data : querySchema.parse({});
  return {
    archived: data.archived === "1",
    assignee: data.assignee,
    status: data.status,
    priority: data.priority,
    category: data.category,
    dependent: data.dependent,
    overdue: data.overdue === "1",
    completed: data.completed === "1",
    sort: data.sort,
    page: data.page,
  };
}

export function roadmapQueryString(query: RoadmapQueryState): string {
  const params = new URLSearchParams();
  if (query.archived) params.set("archived", "1");
  if (query.assignee !== "all") params.set("assignee", query.assignee);
  if (query.status) params.set("status", query.status);
  if (query.priority) params.set("priority", query.priority);
  if (query.category) params.set("category", query.category);
  if (query.dependent) params.set("dependent", query.dependent);
  if (query.overdue) params.set("overdue", "1");
  if (query.completed) params.set("completed", "1");
  if (query.sort !== "manual") params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
