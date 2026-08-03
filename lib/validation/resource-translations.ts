import { z } from "zod";

const trimmed = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);

export const resourceTranslationIdSchema = z.uuid();
export const resourceTranslationLocaleSchema = z.enum(["am", "es"]);
export const resourceTranslationUiLocaleSchema = z.enum(["en", "am", "es"]);
export const resourceTranslationTitleSchema = trimmed(3, 160);
export const resourceTranslationSummarySchema = trimmed(10, 500);
export const resourceTranslationBodySchema = trimmed(50, 50000);
export const resourceTranslationRejectionNoteSchema = trimmed(10, 1000);
export const resourceTranslationVersionSchema = z.coerce.number().int().positive();
export const resourceTranslationPaginationSchema = z.coerce.number().int().positive().max(100).default(1);
export const resourceTranslationStatusFilterSchema = z
  .enum(["draft", "in_review", "approved", "stale"])
  .optional();

export const resourceTranslationCreateSchema = z
  .object({
    resourceId: z.uuid(),
    locale: resourceTranslationLocaleSchema,
    title: resourceTranslationTitleSchema,
    summary: resourceTranslationSummarySchema,
    body: resourceTranslationBodySchema,
  })
  .strict();
export const resourceTranslationUpdateSchema = z
  .object({
    translationId: resourceTranslationIdSchema,
    expectedVersion: resourceTranslationVersionSchema,
    title: resourceTranslationTitleSchema,
    summary: resourceTranslationSummarySchema,
    body: resourceTranslationBodySchema,
  })
  .strict();
export const resourceTranslationTransitionSchema = z
  .object({ translationId: resourceTranslationIdSchema, expectedVersion: resourceTranslationVersionSchema })
  .strict();
export const resourceTranslationRejectionSchema = resourceTranslationTransitionSchema
  .extend({ rejectionNote: resourceTranslationRejectionNoteSchema })
  .strict();
