import { z } from "zod";
import { resourceCategoryValues } from "@/lib/resources/constants";

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
export const resourceAccountIdsSchema = z.array(z.uuid()).min(1);
export const resourceUpdateSchema = resourceDraftSchema.extend({
  resourceId: resourceIdSchema,
  expectedVersion: resourceVersionSchema,
});
export const resourceTransitionSchema = z.object({
  resourceId: resourceIdSchema,
  expectedVersion: resourceVersionSchema,
});
export const resourceRejectionSchema = resourceTransitionSchema.extend({ rejectionNote: trimmed(10, 1000) });
