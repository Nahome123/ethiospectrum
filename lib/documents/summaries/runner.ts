import "server-only";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOpenAiSummaryEnv } from "@/lib/env/server";
import { loadProcessedDocumentSourceChunks } from "@/lib/documents/source-material";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DOCUMENT_SUMMARY_MAX_PROVIDER_CALLS,
  DOCUMENT_SUMMARY_MAX_SOURCE_BATCHES,
  type DocumentSummaryLanguage,
} from "./constants";
import { createOpenAiDocumentSummaryProvider } from "./openai-provider";
import { buildDocumentSummaryPrompt } from "./prompt";
import { isDocumentSummaryProviderError } from "./provider";
import { documentSummaryLanguageSchema, parseDocumentSummaryOutput } from "./schemas";
import {
  collectValidatedDocumentSummarySourceKeys,
  DocumentSummarySourceReferenceError,
  DocumentSummarySourceSelectionError,
  resolveDocumentSummarySourceReferences,
  selectDocumentSummarySources,
} from "./source-selection";
import { toStoredDocumentSummary, toStoredDocumentSummarySourceReferences } from "./storage";
import type {
  DocumentSummaryIntermediateSummary,
  DocumentSummaryOutput,
  DocumentSummaryProvider,
  DocumentSummaryProviderResult,
  DocumentSummarySourceChunk,
  DocumentSummarySourceSelection,
} from "./types";

const DOCUMENT_SUMMARY_BATCH_LIMIT = 2;

type DocumentSummaryFailureCode =
  | "configuration_unavailable"
  | "provider_timeout"
  | "provider_transient_failure"
  | "provider_request_rejected"
  | "provider_invalid_output"
  | "source_validation_failed"
  | "input_limit_exceeded"
  | "document_unavailable";

type ClaimedDocumentSummaryJob = {
  summary_id: string;
  document_id: string;
  household_id: string;
  language: string;
  prompt_version: string;
  attempt_count: number;
  max_attempts: number;
};

type DocumentSummaryWorkerAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type DocumentSummaryBatchResult = {
  processed: number;
  completed: number;
  failed: number;
};

export type DocumentSummaryRunnerDependencies = {
  adminClient?: DocumentSummaryWorkerAdminClient;
  provider?: DocumentSummaryProvider;
};

function revalidateDocumentSummaryPaths(documentId: string): void {
  for (const locale of ["en", "am", "es"]) {
    revalidatePath(`/${locale}/documents`);
    revalidatePath(`/${locale}/documents/${documentId}`);
    revalidatePath(`/${locale}/dashboard`);
  }
}

function isSafeProviderMetadata(result: DocumentSummaryProviderResult): boolean {
  return (
    result.provider === result.provider.trim() &&
    result.provider.length > 0 &&
    result.provider.length <= 80 &&
    result.modelIdentifier === result.modelIdentifier.trim() &&
    result.modelIdentifier.length > 0 &&
    result.modelIdentifier.length <= 160 &&
    Number.isSafeInteger(result.providerCallCount) &&
    result.providerCallCount >= 1
  );
}

function sourceSelectionForBatch(
  selection: DocumentSummarySourceSelection,
  batchIndex: number,
): DocumentSummarySourceSelection {
  const batch = selection.batches[batchIndex];
  if (!batch) throw new DocumentSummarySourceSelectionError();
  return { ...selection, batches: [batch] };
}

function validateProviderSummary(result: DocumentSummaryProviderResult): DocumentSummaryOutput {
  if (!isSafeProviderMetadata(result)) {
    throw new DocumentSummarySourceReferenceError();
  }
  const summary = parseDocumentSummaryOutput(result.structuredSummary);
  if (!summary) throw new DocumentSummarySourceReferenceError();
  return summary;
}

function toFailureCode(error: unknown): DocumentSummaryFailureCode {
  if (isDocumentSummaryProviderError(error)) {
    if (error.code === "configuration_unavailable") return "configuration_unavailable";
    if (error.code === "provider_timeout") return "provider_timeout";
    if (error.code === "provider_unavailable") return "provider_transient_failure";
    if (error.code === "provider_request_rejected") return "provider_request_rejected";
    return "provider_invalid_output";
  }
  if (error instanceof DocumentSummarySourceReferenceError) return "source_validation_failed";
  if (error instanceof DocumentSummarySourceSelectionError) return "input_limit_exceeded";
  return "document_unavailable";
}

async function markJobFailed({
  admin,
  errorCode,
  job,
  workerIdentity,
}: {
  admin: DocumentSummaryWorkerAdminClient;
  errorCode: DocumentSummaryFailureCode;
  job: ClaimedDocumentSummaryJob;
  workerIdentity: string;
}): Promise<void> {
  const failed = await admin.rpc("fail_document_summary_job", {
    target_summary_id: job.summary_id,
    expected_worker_identity: workerIdentity,
    safe_error_code: errorCode,
  });
  if (failed.error || !failed.data) {
    throw new Error("Document summary worker could not record a job failure.");
  }
}

function assertProviderBudget(currentCallCount: number, result: DocumentSummaryProviderResult): number {
  const nextCallCount = currentCallCount + result.providerCallCount;
  if (nextCallCount > DOCUMENT_SUMMARY_MAX_PROVIDER_CALLS) {
    throw new DocumentSummarySourceSelectionError();
  }
  return nextCallCount;
}

async function generateSummary({
  job,
  provider,
  sources,
}: {
  job: ClaimedDocumentSummaryJob;
  provider: DocumentSummaryProvider;
  sources: readonly DocumentSummarySourceChunk[];
}): Promise<{
  finalProviderResult: DocumentSummaryProviderResult;
  structuredSummary: DocumentSummaryOutput;
  selection: DocumentSummarySourceSelection;
  providerCallCount: number;
}> {
  const languageResult = documentSummaryLanguageSchema.safeParse(job.language);
  if (!languageResult.success) throw new DocumentSummarySourceSelectionError();
  const language: DocumentSummaryLanguage = languageResult.data;
  const selection = selectDocumentSummarySources(job.document_id, sources);
  if (selection.batches.length > DOCUMENT_SUMMARY_MAX_SOURCE_BATCHES) {
    throw new DocumentSummarySourceSelectionError();
  }

  const intermediateSummaries: DocumentSummaryIntermediateSummary[] = [];
  let providerCallCount = 0;
  let latestProviderResult: DocumentSummaryProviderResult | null = null;
  for (let index = 0; index < selection.batches.length; index += 1) {
    const batch = selection.batches[index];
    if (!batch) throw new DocumentSummarySourceSelectionError();
    const providerResult = await provider.summarize({
      language,
      prompt: buildDocumentSummaryPrompt({
        phase: "source_batch",
        language,
        sourceCoverage: selection.sourceCoverage,
        batch,
      }),
    });
    const summary = validateProviderSummary(providerResult);
    // A batch may cite only source labels supplied in that batch, not another
    // selected source or an arbitrary opaque label fabricated by the provider.
    resolveDocumentSummarySourceReferences(summary, sourceSelectionForBatch(selection, index));
    providerCallCount = assertProviderBudget(providerCallCount, providerResult);
    latestProviderResult = providerResult;
    intermediateSummaries.push({ batchIndex: batch.index, summary });
  }

  const allowedSourceKeys = collectValidatedDocumentSummarySourceKeys(
    intermediateSummaries.map((item) => item.summary),
    selection,
  );
  if (!allowedSourceKeys.length) throw new DocumentSummarySourceReferenceError();

  const finalProviderResult = await provider.summarize({
    language,
    prompt: buildDocumentSummaryPrompt({
      phase: "final",
      language,
      sourceCoverage: selection.sourceCoverage,
      intermediates: intermediateSummaries,
      allowedSourceKeys,
    }),
  });
  const structuredSummary = validateProviderSummary(finalProviderResult);
  providerCallCount = assertProviderBudget(providerCallCount, finalProviderResult);
  const allowedKeys = new Set(allowedSourceKeys);
  const references = resolveDocumentSummarySourceReferences(structuredSummary, selection);
  if (!references.length || references.some((reference) => !allowedKeys.has(reference.sourceKey))) {
    throw new DocumentSummarySourceReferenceError();
  }

  // All batches and the final answer must come from the same configured provider
  // identity. This also prevents a mock or future adapter from mixing metadata.
  if (
    !latestProviderResult ||
    latestProviderResult.provider !== finalProviderResult.provider ||
    latestProviderResult.modelIdentifier !== finalProviderResult.modelIdentifier
  ) {
    throw new DocumentSummarySourceReferenceError();
  }

  return { finalProviderResult, structuredSummary, selection, providerCallCount };
}

async function processClaimedJob({
  admin,
  job,
  provider,
  workerIdentity,
}: {
  admin: DocumentSummaryWorkerAdminClient;
  job: ClaimedDocumentSummaryJob;
  provider: DocumentSummaryProvider;
  workerIdentity: string;
}): Promise<"completed" | "failed"> {
  let failureCode: DocumentSummaryFailureCode = "document_unavailable";
  try {
    const sources = await loadProcessedDocumentSourceChunks(admin, {
      documentId: job.document_id,
      householdId: job.household_id,
    });
    const generated = await generateSummary({ job, provider, sources });
    const references = resolveDocumentSummarySourceReferences(
      generated.structuredSummary,
      generated.selection,
    );
    const completed = await admin.rpc("complete_document_summary_job", {
      target_summary_id: job.summary_id,
      expected_worker_identity: workerIdentity,
      completed_summary_text: generated.structuredSummary.overview.text,
      completed_structured_summary: toStoredDocumentSummary(generated.structuredSummary),
      completed_source_references: toStoredDocumentSummarySourceReferences(references),
      completed_source_coverage: generated.selection.sourceCoverage,
      completed_source_item_count: generated.selection.selectedChunkCount,
      completed_source_character_count: generated.selection.selectedCharacterCount,
      completed_provider: generated.finalProviderResult.provider,
      completed_model_identifier: generated.finalProviderResult.modelIdentifier,
      completed_provider_call_count: generated.providerCallCount,
    });
    if (!completed.error && completed.data) return "completed";
  } catch (error) {
    failureCode = toFailureCode(error);
  }

  // This guarded transition is deliberately outside the generation try/catch:
  // if it cannot be confirmed, callers receive a generic availability error
  // instead of incorrectly claiming the job failed safely.
  await markJobFailed({ admin, job, workerIdentity, errorCode: failureCode });
  return "failed";
}

/**
 * Runs a deliberately small protected batch. It returns counts only: no
 * document text, excerpts, summaries, provider payloads, or secrets leave this
 * server-only boundary.
 */
export async function runDocumentSummaryBatch(
  requestedLimit = DOCUMENT_SUMMARY_BATCH_LIMIT,
  dependencies: DocumentSummaryRunnerDependencies = {},
): Promise<DocumentSummaryBatchResult> {
  const limit = Math.min(Math.max(1, requestedLimit), DOCUMENT_SUMMARY_BATCH_LIMIT);
  const admin = dependencies.adminClient ?? createSupabaseAdminClient();
  // Fail before claiming work when configuration is absent, preserving queued
  // jobs for an operator to retry after configuration is repaired.
  const provider = dependencies.provider ?? createOpenAiDocumentSummaryProvider(requireOpenAiSummaryEnv());
  const workerIdentity = `document-summary-worker-${randomUUID()}`;
  const result: DocumentSummaryBatchResult = { processed: 0, completed: 0, failed: 0 };

  for (let index = 0; index < limit; index += 1) {
    const claimed = await admin.rpc("claim_next_document_summary_job", { worker_identity: workerIdentity });
    if (claimed.error) {
      throw new Error("Document summary worker could not claim a job.");
    }
    const job = claimed.data?.[0] as ClaimedDocumentSummaryJob | undefined;
    if (!job) break;

    const outcome = await processClaimedJob({ admin, job, provider, workerIdentity });
    revalidateDocumentSummaryPaths(job.document_id);
    result.processed += 1;
    if (outcome === "completed") result.completed += 1;
    if (outcome === "failed") result.failed += 1;
  }

  return result;
}
