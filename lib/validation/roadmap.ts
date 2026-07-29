import { z } from "zod";
import {
  roadmapCategoryValues,
  roadmapPriorityValues,
  roadmapStatusValues,
  type RoadmapCategory,
  type RoadmapPriority,
  type RoadmapStatus,
} from "@/lib/roadmap/constants";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(z.uuid().nullable());

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function createRoadmapItemSchema(messages: { title: string; description: string; date: string }) {
  return z.object({
    title: z.string().trim().min(1, messages.title).max(160, messages.title),
    description: optionalText(4000).refine(() => true, messages.description),
    category: z.enum(roadmapCategoryValues),
    priority: z.enum(roadmapPriorityValues),
    status: z.enum(roadmapStatusValues),
    dueDate: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .refine((value) => value === null || isCalendarDate(value), messages.date),
    dependentId: optionalUuid,
    assignedTo: optionalUuid,
  });
}

export const roadmapCreateSchema = z.object({
  idempotencyKey: z.uuid(),
});

export const roadmapExpectedVersionSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

export const roadmapItemIdSchema = z.uuid();
export const roadmapDirectionSchema = z.enum(["up", "down"]);

export type RoadmapItemInput = {
  title: string;
  description: string | null;
  category: RoadmapCategory;
  priority: RoadmapPriority;
  status: RoadmapStatus;
  dueDate: string | null;
  dependentId: string | null;
  assignedTo: string | null;
};

export function canTransitionRoadmapStatus(current: RoadmapStatus, next: RoadmapStatus): boolean {
  const transitions: Record<RoadmapStatus, readonly RoadmapStatus[]> = {
    not_started: ["in_progress", "blocked", "completed", "cancelled"],
    in_progress: ["not_started", "blocked", "completed", "cancelled"],
    blocked: ["not_started", "in_progress", "completed", "cancelled"],
    completed: ["not_started", "in_progress"],
    cancelled: ["not_started"],
  };
  return transitions[current].includes(next);
}

export function isRoadmapOverdue(
  item: {
    dueDate: string | null;
    status: RoadmapStatus;
    archivedAt: string | null;
  },
  today: string,
): boolean {
  return (
    item.dueDate !== null &&
    item.dueDate < today &&
    item.status !== "completed" &&
    item.status !== "cancelled" &&
    item.archivedAt === null
  );
}
