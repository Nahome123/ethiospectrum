import { describe, expect, it } from "vitest";
import { adminQueueValues, primaryAdminQueues, secondaryAdminQueueGroups } from "@/lib/services/constants";

describe("admin queue filters", () => {
  it("shows every queue exactly once, as a tab or in the More filters menu", () => {
    const shown = [...primaryAdminQueues, ...secondaryAdminQueueGroups.flatMap((group) => group.queues)];
    expect(shown.filter((queue) => queue !== "all").sort()).toEqual([...adminQueueValues].sort());
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("keeps the visible tab row short", () => {
    expect(primaryAdminQueues).toEqual(["all", "new", "awaiting_payment", "upcoming"]);
  });
});
