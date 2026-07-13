import { z } from "zod";

export const documentCitationSchema = z.object({
  documentId: z.string().uuid(),
  documentTitle: z.string(),
  pageNumber: z.number().int().positive(),
  excerpt: z.string().max(500),
});
export const assistantAnswerSchema = z.object({
  answer: z.string(),
  answerLanguage: z.enum(["en", "am", "es"]),
  evidenceStrength: z.enum(["strong", "partial", "insufficient"]),
  citations: z.array(documentCitationSchema),
  generalInformation: z.array(z.string()),
  suggestedQuestions: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>;
