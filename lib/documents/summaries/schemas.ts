import { z } from "zod";
import {
  DOCUMENT_SUMMARY_LANGUAGES,
  DOCUMENT_SUMMARY_MAX_ACTION_ITEMS,
  DOCUMENT_SUMMARY_MAX_DATE_CHARACTERS,
  DOCUMENT_SUMMARY_MAX_IMPORTANT_DATES,
  DOCUMENT_SUMMARY_MAX_KEY_POINTS,
  DOCUMENT_SUMMARY_MAX_ORGANIZATIONS_OR_PEOPLE,
  DOCUMENT_SUMMARY_MAX_OVERVIEW_CHARACTERS,
  DOCUMENT_SUMMARY_MAX_SOURCE_REFERENCES_PER_STATEMENT,
  DOCUMENT_SUMMARY_MAX_STATEMENT_CHARACTERS,
  DOCUMENT_SUMMARY_MAX_WARNINGS_OR_UNCERTAINTIES,
} from "./constants";
import type { DocumentSummaryOutput } from "./types";

const sourceKeySchema = z.string().regex(/^src_[0-9]{3,5}$/);

function hasUniqueSourceKeys(value: readonly string[]): boolean {
  return new Set(value).size === value.length;
}

const optionalSourceKeysSchema = z
  .array(sourceKeySchema)
  .max(DOCUMENT_SUMMARY_MAX_SOURCE_REFERENCES_PER_STATEMENT)
  .refine(hasUniqueSourceKeys, "Source keys must be unique.");

const citedSourceKeysSchema = optionalSourceKeysSchema.min(1);

const optionalStatementSchema = z
  .object({
    text: z.string().trim().max(DOCUMENT_SUMMARY_MAX_OVERVIEW_CHARACTERS),
    sourceKeys: optionalSourceKeysSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.text.length > 0 && value.sourceKeys.length === 0) {
      context.addIssue({
        code: "custom",
        message: "A non-empty statement requires a source reference.",
        path: ["sourceKeys"],
      });
    }
    if (value.text.length === 0 && value.sourceKeys.length > 0) {
      context.addIssue({
        code: "custom",
        message: "An empty statement cannot contain source references.",
        path: ["sourceKeys"],
      });
    }
  });

const citedStatementSchema = z
  .object({
    text: z.string().trim().min(1).max(DOCUMENT_SUMMARY_MAX_STATEMENT_CHARACTERS),
    sourceKeys: citedSourceKeysSchema,
  })
  .strict();

const importantDateSchema = z
  .object({
    date: z.string().trim().min(1).max(DOCUMENT_SUMMARY_MAX_DATE_CHARACTERS),
    description: z.string().trim().min(1).max(DOCUMENT_SUMMARY_MAX_STATEMENT_CHARACTERS),
    sourceKeys: citedSourceKeysSchema,
  })
  .strict();

const organizationOrPersonSchema = z
  .object({
    name: z.string().trim().min(1).max(DOCUMENT_SUMMARY_MAX_DATE_CHARACTERS),
    description: z.string().trim().min(1).max(DOCUMENT_SUMMARY_MAX_STATEMENT_CHARACTERS),
    sourceKeys: citedSourceKeysSchema,
  })
  .strict();

/**
 * Provider output is treated as untrusted. All fields stay present so the strict
 * JSON Schema can be used without optional-output ambiguity; unsupported sections
 * are represented by empty strings or arrays.
 */
export const documentSummaryOutputSchema = z
  .object({
    overview: optionalStatementSchema,
    keyPoints: z.array(citedStatementSchema).max(DOCUMENT_SUMMARY_MAX_KEY_POINTS),
    importantDates: z.array(importantDateSchema).max(DOCUMENT_SUMMARY_MAX_IMPORTANT_DATES),
    actionItems: z.array(citedStatementSchema).max(DOCUMENT_SUMMARY_MAX_ACTION_ITEMS),
    organizationsOrPeople: z
      .array(organizationOrPersonSchema)
      .max(DOCUMENT_SUMMARY_MAX_ORGANIZATIONS_OR_PEOPLE),
    warningsOrUncertainties: z
      .array(citedStatementSchema)
      .max(DOCUMENT_SUMMARY_MAX_WARNINGS_OR_UNCERTAINTIES),
  })
  .strict();

export const documentSummaryLanguageSchema = z.enum(DOCUMENT_SUMMARY_LANGUAGES);

/**
 * This manually maintained schema intentionally stays inside the OpenAI strict
 * structured-output subset and mirrors `documentSummaryOutputSchema`.
 */
const sourceKeysJsonSchema = {
  type: "array",
  items: { type: "string", pattern: "^src_[0-9]{3,5}$" },
  maxItems: DOCUMENT_SUMMARY_MAX_SOURCE_REFERENCES_PER_STATEMENT,
  uniqueItems: true,
} as const;

const citedStatementJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "sourceKeys"],
  properties: {
    text: { type: "string", minLength: 1, maxLength: DOCUMENT_SUMMARY_MAX_STATEMENT_CHARACTERS },
    sourceKeys: { ...sourceKeysJsonSchema, minItems: 1 },
  },
} as const;

export const documentSummaryOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "overview",
    "keyPoints",
    "importantDates",
    "actionItems",
    "organizationsOrPeople",
    "warningsOrUncertainties",
  ],
  properties: {
    overview: {
      type: "object",
      additionalProperties: false,
      required: ["text", "sourceKeys"],
      properties: {
        text: { type: "string", maxLength: DOCUMENT_SUMMARY_MAX_OVERVIEW_CHARACTERS },
        sourceKeys: sourceKeysJsonSchema,
      },
    },
    keyPoints: { type: "array", maxItems: DOCUMENT_SUMMARY_MAX_KEY_POINTS, items: citedStatementJsonSchema },
    importantDates: {
      type: "array",
      maxItems: DOCUMENT_SUMMARY_MAX_IMPORTANT_DATES,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "description", "sourceKeys"],
        properties: {
          date: { type: "string", minLength: 1, maxLength: DOCUMENT_SUMMARY_MAX_DATE_CHARACTERS },
          description: { type: "string", minLength: 1, maxLength: DOCUMENT_SUMMARY_MAX_STATEMENT_CHARACTERS },
          sourceKeys: { ...sourceKeysJsonSchema, minItems: 1 },
        },
      },
    },
    actionItems: {
      type: "array",
      maxItems: DOCUMENT_SUMMARY_MAX_ACTION_ITEMS,
      items: citedStatementJsonSchema,
    },
    organizationsOrPeople: {
      type: "array",
      maxItems: DOCUMENT_SUMMARY_MAX_ORGANIZATIONS_OR_PEOPLE,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "sourceKeys"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: DOCUMENT_SUMMARY_MAX_DATE_CHARACTERS },
          description: { type: "string", minLength: 1, maxLength: DOCUMENT_SUMMARY_MAX_STATEMENT_CHARACTERS },
          sourceKeys: { ...sourceKeysJsonSchema, minItems: 1 },
        },
      },
    },
    warningsOrUncertainties: {
      type: "array",
      maxItems: DOCUMENT_SUMMARY_MAX_WARNINGS_OR_UNCERTAINTIES,
      items: citedStatementJsonSchema,
    },
  },
} as const;

export function parseDocumentSummaryOutput(value: unknown): DocumentSummaryOutput | null {
  const parsed = documentSummaryOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
