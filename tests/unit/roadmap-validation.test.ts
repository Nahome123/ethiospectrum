import { describe, expect, it } from "vitest";
import {
  canTransitionRoadmapStatus,
  createRoadmapItemSchema,
  isRoadmapOverdue,
} from "@/lib/validation/roadmap";
import { parseRoadmapQuery, roadmapQueryString } from "@/lib/roadmap/query-state";

const messages = {
  title: "Title is required.",
  description: "Description is too long.",
  date: "Use a valid calendar date.",
};

const validItem = {
  title: "  የቤተሰብ plan  ",
  description: "  Planificar la reunión escolar.  ",
  category: "education",
  priority: "medium",
  status: "not_started",
  dueDate: "2026-08-01",
  dependentId: "",
  assignedTo: "",
};

describe("roadmap validation", () => {
  it("preserves multilingual text while normalizing optional fields", () => {
    expect(createRoadmapItemSchema(messages).parse(validItem)).toEqual({
      ...validItem,
      title: "የቤተሰብ plan",
      description: "Planificar la reunión escolar.",
      dependentId: null,
      assignedTo: null,
    });
  });

  it("rejects blank, oversized, malformed, and non-calendar input", () => {
    const schema = createRoadmapItemSchema(messages);
    expect(schema.safeParse({ ...validItem, title: "   " }).success).toBe(false);
    expect(schema.safeParse({ ...validItem, title: "x".repeat(161) }).success).toBe(false);
    expect(schema.safeParse({ ...validItem, description: "x".repeat(4001) }).success).toBe(false);
    expect(schema.safeParse({ ...validItem, dueDate: "2026-02-30" }).success).toBe(false);
    expect(schema.safeParse({ ...validItem, dependentId: "not-a-uuid" }).success).toBe(false);
  });

  it("enforces the roadmap status transition graph", () => {
    expect(canTransitionRoadmapStatus("not_started", "blocked")).toBe(true);
    expect(canTransitionRoadmapStatus("in_progress", "completed")).toBe(true);
    expect(canTransitionRoadmapStatus("completed", "in_progress")).toBe(true);
    expect(canTransitionRoadmapStatus("cancelled", "not_started")).toBe(true);
    expect(canTransitionRoadmapStatus("completed", "cancelled")).toBe(false);
    expect(canTransitionRoadmapStatus("cancelled", "completed")).toBe(false);
  });

  it("identifies only active, incomplete past-due items as overdue", () => {
    expect(
      isRoadmapOverdue({ dueDate: "2026-07-28", status: "in_progress", archivedAt: null }, "2026-07-29"),
    ).toBe(true);
    expect(
      isRoadmapOverdue({ dueDate: "2026-07-28", status: "completed", archivedAt: null }, "2026-07-29"),
    ).toBe(false);
    expect(
      isRoadmapOverdue(
        { dueDate: "2026-07-28", status: "blocked", archivedAt: "2026-07-29T00:00:00Z" },
        "2026-07-29",
      ),
    ).toBe(false);
  });
});

describe("roadmap query state", () => {
  it("accepts only the controlled filters and serializes a safe URL", () => {
    const query = parseRoadmapQuery({
      archived: "1",
      assignee: "me",
      status: "blocked",
      priority: "high",
      category: "education",
      dependent: "20000000-0000-4000-8000-000000000002",
      overdue: "1",
      sort: "due_date",
      page: "2",
    });

    expect(query).toMatchObject({ archived: true, assignee: "me", overdue: true, page: 2 });
    expect(roadmapQueryString(query)).toBe(
      "?archived=1&assignee=me&status=blocked&priority=high&category=education&dependent=20000000-0000-4000-8000-000000000002&overdue=1&sort=due_date&page=2",
    );
  });

  it("falls back safely for unrecognized or malformed query input", () => {
    expect(
      parseRoadmapQuery({
        assignee: "other-user-id",
        status: "delete",
        dependent: "not-a-uuid",
        sort: "created_at.desc",
        page: "0",
      }),
    ).toEqual({
      archived: false,
      assignee: "all",
      overdue: false,
      completed: false,
      sort: "manual",
      page: 1,
    });
  });
});
