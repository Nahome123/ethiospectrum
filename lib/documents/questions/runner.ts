import "server-only";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOpenAiQuestionEnv } from "@/lib/env/server";
import {
  loadProcessedDocumentSourceChunks,
  DocumentSourceMaterialError,
} from "@/lib/documents/source-material";
import { isDocumentStructuredProviderError } from "@/lib/documents/openai-structured-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DOCUMENT_QUESTION_MAX_PROVIDER_CALLS,
  DOCUMENT_QUESTION_MAX_SOURCE_CHARACTERS,
  DOCUMENT_QUESTION_MAX_SOURCE_CHUNKS,
  type DocumentQuestionLanguage,
} from "./constants";
import { createOpenAiDocumentQuestionProvider } from "./openai-provider";
import { buildDocumentQuestionPrompt } from "./prompt";
import {
  documentQuestionInputSchema,
  documentQuestionLanguageSchema,
  parseDocumentQuestionOutput,
} from "./schemas";
import { resolveDocumentQuestionSourceReferences } from "./source-references";
import { toStoredDocumentQuestionSourceReferences } from "./storage";
import type { DocumentQuestionProvider, DocumentQuestionProviderResult } from "./types";
import {
  DocumentSummarySourceReferenceError,
  DocumentSummarySourceSelectionError,
  selectDocumentSummarySources,
} from "../summaries/source-selection";

const DOCUMENT_QUESTION_BATCH_LIMIT = 2;

type DocumentQuestionFailureCode =
  | "configuration_unavailable"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_request_rejected"
  | "provider_invalid_response"
  | "source_validation_failed"
  | "input_limit_exceeded"
  | "document_unavailable";

type ClaimedDocumentQuestionJob = {
  question_id: string;
  document_id: string;
  household_id: string;
  language: string;
  question: string;
  prompt_version: string;
  attempt_count: number;
  max_attempts: number;
};

type DocumentQuestionWorkerAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type DocumentQuestionBatchResult = { processed: number; completed: number; failed: number };

export type DocumentQuestionRunnerDependencies = {
  adminClient?: DocumentQuestionWorkerAdminClient;
  provider?: DocumentQuestionProvider;
};

function revalidateDocumentQuestionPaths(documentId: string): void {
  for (const locale of ["en", "am", "es"]) {
    revalidatePath(`/${locale}/documents`);
    revalidatePath(`/${locale}/documents/${documentId}`);
    revalidatePath(`/${locale}/dashboard`);
  }
}

function isSafeProviderMetadata(result: DocumentQuestionProviderResult): boolean {
  return (
    result.provider === result.provider.trim() &&
    result.provider.length > 0 &&
    result.provider.length <= 80 &&
    result.modelIdentifier === result.modelIdentifier.trim() &&
    result.modelIdentifier.length > 0 &&
    result.modelIdentifier.length <= 160 &&
    Number.isSafeInteger(result.providerCallCount) &&
    result.providerCallCount >= 1 &&
    result.providerCallCount <= DOCUMENT_QUESTION_MAX_PROVIDER_CALLS
  );
}

function toFailureCode(error: unknown): DocumentQuestionFailureCode {
  if (isDocumentStructuredProviderError(error)) {
    if (error.code === "configuration_unavailable") return "configuration_unavailable";
    if (error.code === "provider_timeout") return "provider_timeout";
    if (error.code === "provider_unavailable") return "provider_unavailable";
    if (error.code === "provider_request_rejected") return "provider_request_rejected";
    return "provider_invalid_response";
  }
  if (error instanceof DocumentSummarySourceReferenceError) return "source_validation_failed";
  if (error instanceof DocumentSummarySourceSelectionError) return "input_limit_exceeded";
  if (error instanceof DocumentSourceMaterialError) return "document_unavailable";
  return "document_unavailable";
}

async function markJobFailed({
  admin,
  job,
  workerIdentity,
  errorCode,
}: {
  admin: DocumentQuestionWorkerAdminClient;
  job: ClaimedDocumentQuestionJob;
  workerIdentity: string;
  errorCode: DocumentQuestionFailureCode;
}): Promise<void> {
  const failed = await admin.rpc("fail_document_question_job", {
    target_question_id: job.question_id,
    expected_worker_identity: workerIdentity,
    safe_error_code: errorCode,
  });
  if (failed.error || !failed.data) {
    throw new Error("Document question worker could not record a job failure.");
  }
}

async function answerQuestion({
  job,
  provider,
  admin,
}: {
  job: ClaimedDocumentQuestionJob;
  provider: DocumentQuestionProvider;
  admin: DocumentQuestionWorkerAdminClient;
}) {
  const languageResult = documentQuestionLanguageSchema.safeParse(job.language);
  if (!languageResult.success) throw new DocumentSummarySourceSelectionError();
  const question = documentQuestionInputSchema.safeParse({ question: job.question });
  if (!question.success) throw new DocumentSummarySourceSelectionError();
  const language: DocumentQuestionLanguage = languageResult.data;
  const sources = await loadProcessedDocumentSourceChunks(admin, {
    documentId: job.document_id,
    householdId: job.household_id,
  });
  const selection = selectDocumentSummarySources(job.document_id, sources, {
    maxSourceChunks: DOCUMENT_QUESTION_MAX_SOURCE_CHUNKS,
    maxSourceCharacters: DOCUMENT_QUESTION_MAX_SOURCE_CHARACTERS,
    maxSourceBatches: 1,
    maxChunksPerBatch: DOCUMENT_QUESTION_MAX_SOURCE_CHUNKS,
    maxCharactersPerBatch: DOCUMENT_QUESTION_MAX_SOURCE_CHARACTERS,
  });
  const selectedSources = selection.batches.flatMap((batch) => batch.sources);
  const result = await provider.answer({
    language,
    prompt: buildDocumentQuestionPrompt({
      language,
      question: question.data.question,
      selection,
      sources: selectedSources,
    }),
  });
  if (!isSafeProviderMetadata(result)) throw new DocumentSummarySourceReferenceError();
  const answer = parseDocumentQuestionOutput(result.answer);
  if (!answer) throw new DocumentSummarySourceReferenceError();
  const references = resolveDocumentQuestionSourceReferences(answer, selection);
  if (!references.length || references.length !== answer.sourceKeys.length) {
    throw new DocumentSummarySourceReferenceError();
  }
  return { result, answer, references, selection };
}

async function processClaimedJob({
  admin,
  job,
  provider,
  workerIdentity,
}: {
  admin: DocumentQuestionWorkerAdminClient;
  job: ClaimedDocumentQuestionJob;
  provider: DocumentQuestionProvider;
  workerIdentity: string;
}): Promise<"completed" | "failed"> {
  let failureCode: DocumentQuestionFailureCode = "document_unavailable";
  try {
    const generated = await answerQuestion({ admin, job, provider });
    const completed = await admin.rpc("complete_document_question_job", {
      target_question_id: job.question_id,
      expected_worker_identity: workerIdentity,
      completed_answer_text: generated.answer.answer,
      completed_source_references: toStoredDocumentQuestionSourceReferences(generated.references),
      completed_source_coverage: generated.selection.sourceCoverage,
      completed_source_item_count: generated.selection.selectedChunkCount,
      completed_source_character_count: generated.selection.selectedCharacterCount,
      completed_provider: generated.result.provider,
      completed_model_identifier: generated.result.modelIdentifier,
      completed_provider_call_count: generated.result.providerCallCount,
    });
    if (!completed.error && completed.data) return "completed";
  } catch (error) {
    failureCode = toFailureCode(error);
  }
  await markJobFailed({ admin, job, workerIdentity, errorCode: failureCode });
  return "failed";
}

/** Processes a small aggregate-only batch; document text never leaves this server boundary. */
export async function runDocumentQuestionBatch(
  requestedLimit = DOCUMENT_QUESTION_BATCH_LIMIT,
  dependencies: DocumentQuestionRunnerDependencies = {},
): Promise<DocumentQuestionBatchResult> {
  const limit = Math.min(Math.max(1, requestedLimit), DOCUMENT_QUESTION_BATCH_LIMIT);
  const admin = dependencies.adminClient ?? createSupabaseAdminClient();
  const provider = dependencies.provider ?? createOpenAiDocumentQuestionProvider(requireOpenAiQuestionEnv());
  const workerIdentity = `document-question-worker-${randomUUID()}`;
  const result: DocumentQuestionBatchResult = { processed: 0, completed: 0, failed: 0 };

  for (let index = 0; index < limit; index += 1) {
    const claimed = await admin.rpc("claim_next_document_question_job", { worker_identity: workerIdentity });
    if (claimed.error) throw new Error("Document question worker could not claim a job.");
    const job = claimed.data?.[0] as ClaimedDocumentQuestionJob | undefined;
    if (!job) break;
    const outcome = await processClaimedJob({ admin, job, provider, workerIdentity });
    revalidateDocumentQuestionPaths(job.document_id);
    result.processed += 1;
    if (outcome === "completed") result.completed += 1;
    if (outcome === "failed") result.failed += 1;
  }
  return result;
}
