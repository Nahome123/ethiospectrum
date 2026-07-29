import { z } from "zod";
import {
  DOCUMENT_CHAT_LANGUAGES,
  DOCUMENT_CHAT_MAX_ANSWER_CHARACTERS,
  DOCUMENT_CHAT_MAX_MESSAGE_CHARACTERS,
  DOCUMENT_CHAT_MAX_SOURCE_REFERENCES,
  DOCUMENT_CHAT_RESULT_TYPES,
} from "./constants";
import type { DocumentChatOutput } from "./types";

const sourceKeySchema = z.string().regex(/^src_[0-9]{3,5}$/);

export const documentChatLanguageSchema = z.enum(DOCUMENT_CHAT_LANGUAGES);
export const documentChatMessageInputSchema = z.object({
  message: z.string().trim().min(1).max(DOCUMENT_CHAT_MAX_MESSAGE_CHARACTERS),
  idempotencyKey: z.string().uuid(),
});

export const documentChatOutputSchema = z
  .object({
    answer: z.string().trim().min(1).max(DOCUMENT_CHAT_MAX_ANSWER_CHARACTERS),
    resultType: z.enum(DOCUMENT_CHAT_RESULT_TYPES),
    sourceKeys: z.array(sourceKeySchema).max(DOCUMENT_CHAT_MAX_SOURCE_REFERENCES),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.sourceKeys).size !== value.sourceKeys.length) {
      context.addIssue({ code: "custom", message: "Source keys must be unique." });
    }
    const factual = value.resultType === "grounded_answer" || value.resultType === "partial_coverage";
    if ((factual && value.sourceKeys.length === 0) || (!factual && value.sourceKeys.length !== 0)) {
      context.addIssue({ code: "custom", message: "Result type and source keys must agree." });
    }
  });

export const documentChatOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "resultType", "sourceKeys"],
  properties: {
    answer: { type: "string", minLength: 1, maxLength: DOCUMENT_CHAT_MAX_ANSWER_CHARACTERS },
    resultType: { enum: DOCUMENT_CHAT_RESULT_TYPES },
    sourceKeys: {
      type: "array",
      items: { type: "string", pattern: "^src_[0-9]{3,5}$" },
      maxItems: DOCUMENT_CHAT_MAX_SOURCE_REFERENCES,
    },
  },
} as const;

export function parseDocumentChatOutput(value: unknown): DocumentChatOutput | null {
  const parsed = documentChatOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
