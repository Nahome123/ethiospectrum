import { z } from "zod";
import { resourceCategoryValues, resourceTypeValues } from "@/lib/resources/constants";

const trimmed = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);

export const resourceIdSchema = z.uuid();
export const resourceVersionSchema = z.coerce.number().int().positive();
export const resourceSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const resourceDraftSchema = z.object({
  slug: resourceSlugSchema,
  category: z.enum(resourceCategoryValues),
  title: trimmed(3, 160),
  summary: trimmed(10, 500),
  body: trimmed(50, 50000),
});
export const resourceCreateSchema = resourceDraftSchema.extend({ idempotencyKey: z.uuid() });
export const resourceAccountIdsSchema = z.array(z.uuid()).max(100);
export const resourceUpdateSchema = resourceDraftSchema.extend({
  resourceId: resourceIdSchema,
  expectedVersion: resourceVersionSchema,
});
export const resourceTransitionSchema = z.object({
  resourceId: resourceIdSchema,
  expectedVersion: resourceVersionSchema,
});
export const resourceRejectionSchema = resourceTransitionSchema.extend({ rejectionNote: trimmed(10, 1000) });

const optionalQueryText = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z.string().trim().max(100).catch(""),
);
const optionalCategory = z.preprocess(
  (value) => (typeof value === "string" && value !== "" ? value : undefined),
  z.enum(resourceCategoryValues).optional().catch(undefined),
);
const optionalResourceType = z.preprocess(
  (value) => (typeof value === "string" && value !== "" ? value : undefined),
  z.enum(resourceTypeValues).optional().catch(undefined),
);

export const memberResourceQuerySchema = z.object({
  q: optionalQueryText,
  category: optionalCategory,
  type: optionalResourceType,
  bookmarked: z.preprocess((value) => value === "1", z.boolean()),
  assigned: z.preprocess((value) => value === "1", z.boolean()),
  featured: z.preprocess((value) => value === "1", z.boolean()),
  catalog: z.preprocess((value) => value === "1", z.boolean()),
  page: z.preprocess((value) => value ?? 1, z.coerce.number().int().positive().catch(1)),
});

export const resourceBookmarkIntentSchema = z.object({
  slug: resourceSlugSchema,
  bookmarked: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const resourceDiscoveryMetadataSchema = z.object({
  resourceId: resourceIdSchema,
  expectedVersion: resourceVersionSchema,
  resourceType: z.enum(resourceTypeValues),
  featuredRank: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .pipe(z.number().int().min(1).max(1000).nullable()),
});

export type MemberResourceQuery = z.infer<typeof memberResourceQuerySchema>;
