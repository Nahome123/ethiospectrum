import { describe, expect, it } from "vitest";
import {
  resourceCreateSchema,
  resourceDraftSchema,
  resourceRejectionSchema,
  resourceSlugSchema,
} from "@/lib/validation/resources";

const valid = {
  slug: "family-school-meeting",
  category: "education",
  title: "Preparing for a school meeting",
  summary: "A practical guide for preparing useful questions before a school meeting.",
  body: "This is a sufficiently long canonical English resource body that is safe to submit for editorial review.",
};

describe("resource validation", () => {
  it("accepts bounded canonical-English content and a UUID idempotency key", () => {
    expect(
      resourceCreateSchema.safeParse({ ...valid, idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })
        .success,
    ).toBe(true);
  });
  it("rejects unsafe slugs, unsupported categories, and short content", () => {
    expect(resourceSlugSchema.safeParse("Not a slug").success).toBe(false);
    expect(resourceDraftSchema.safeParse({ ...valid, category: "clinical" }).success).toBe(false);
    expect(resourceDraftSchema.safeParse({ ...valid, body: "too short" }).success).toBe(false);
  });
  it("requires an appropriately bounded rejection note", () => {
    expect(
      resourceRejectionSchema.safeParse({
        resourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expectedVersion: 1,
        rejectionNote: "too short",
      }).success,
    ).toBe(false);
  });
});
