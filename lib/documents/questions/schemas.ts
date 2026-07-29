import { z } from "zod";
import {
  DOCUMENT_QUESTION_LANGUAGES,
  DOCUMENT_QUESTION_MAX_ANSWER_CHARACTERS,
  DOCUMENT_QUESTION_MAX_CHARACTERS,
  DOCUMENT_QUESTION_MAX_SOURCE_REFERENCES,
} from "./constants";
import type { DocumentQuestionOutput } from "./types";

const sourceKeySchema = z.string().regex(/^src_[0-9]{3,5}$/);

export const documentQuestionLanguageSchema = z.enum(DOCUMENT_QUESTION_LANGUAGES);

export const documentQuestionInputSchema = z.object({
  question: z.string().trim().min(1).max(DOCUMENT_QUESTION_MAX_CHARACTERS),
});

export const documentQuestionOutputSchema = z
  .object({
    answer: z.string().trim().min(1).max(DOCUMENT_QUESTION_MAX_ANSWER_CHARACTERS),
    sourceKeys: z
      .array(sourceKeySchema)
      .min(1)
      .max(DOCUMENT_QUESTION_MAX_SOURCE_REFERENCES)
      .refine((value) => new Set(value).size === value.length, "Source keys must be unique."),
  })
  .strict();

/** Strict structured-output schema kept aligned with the Zod boundary above. */
export const documentQuestionOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "sourceKeys"],
  properties: {
    answer: { type: "string", minLength: 1, maxLength: DOCUMENT_QUESTION_MAX_ANSWER_CHARACTERS },
    sourceKeys: {
      type: "array",
      items: { type: "string", pattern: "^src_[0-9]{3,5}$" },
      minItems: 1,
      maxItems: DOCUMENT_QUESTION_MAX_SOURCE_REFERENCES,
    },
  },
} as const;

export function parseDocumentQuestionOutput(value: unknown): DocumentQuestionOutput | null {
  const parsed = documentQuestionOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
