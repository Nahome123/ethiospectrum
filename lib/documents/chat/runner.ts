import "server-only";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOpenAiQuestionEnv } from "@/lib/env/server";
import { isDocumentStructuredProviderError } from "@/lib/documents/openai-structured-provider";
import {
  DocumentSourceMaterialError,
  loadProcessedDocumentSourceChunks,
} from "@/lib/documents/source-material";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DOCUMENT_CHAT_MAX_HISTORY_MESSAGES,
  DOCUMENT_CHAT_MAX_PROVIDER_CALLS,
  DOCUMENT_CHAT_MAX_SOURCE_CHARACTERS,
  DOCUMENT_CHAT_MAX_SOURCE_CHUNKS,
  type DocumentChatLanguage,
} from "./constants";
import { createOpenAiDocumentChatProvider } from "./openai-provider";
import { buildDocumentChatPrompt } from "./prompt";
import { documentChatLanguageSchema, parseDocumentChatOutput } from "./schemas";
import { resolveDocumentChatCitations } from "./source-references";
import { toStoredDocumentChatCitations } from "./storage";
import type { DocumentChatHistoryMessage, DocumentChatProvider, DocumentChatProviderResult } from "./types";
import {
  DocumentSummarySourceReferenceError,
  DocumentSummarySourceSelectionError,
  selectDocumentSummarySources,
} from "../summaries/source-selection";

const DOCUMENT_CHAT_BATCH_LIMIT = 2;

type DocumentChatFailureCode =
  | "configuration_unavailable"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_request_rejected"
  | "provider_invalid_response"
  | "source_validation_failed"
  | "input_limit_exceeded"
  | "document_unavailable";

type ClaimedDocumentChatMessage = {
  message_id: string;
  conversation_id: string;
  document_id: string;
  household_id: string;
  language: string;
  attempt_count: number;
  max_attempts: number;
};

type DocumentChatWorkerAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type DocumentChatBatchResult = {
  processed: number;
  completed: number;
  failed: number;
  failureCodes?: Partial<Record<DocumentChatFailureCode, number>>;
};

export type DocumentChatRunnerDependencies = {
  adminClient?: DocumentChatWorkerAdminClient;
  provider?: DocumentChatProvider;
};

function revalidateDocumentChatPaths(documentId: string, conversationId: string): void {
  for (const locale of ["en", "am", "es"]) {
    revalidatePath(`/${locale}/documents`);
    revalidatePath(`/${locale}/documents/${documentId}`);
    revalidatePath(`/${locale}/documents/${documentId}/chat`);
    revalidatePath(`/${locale}/documents/${documentId}/chat/${conversationId}`);
  }
}

function isSafeProviderMetadata(result: DocumentChatProviderResult): boolean {
  return (
    result.provider === result.provider.trim() &&
    result.provider.length > 0 &&
    result.provider.length <= 80 &&
    result.modelIdentifier === result.modelIdentifier.trim() &&
    result.modelIdentifier.length > 0 &&
    result.modelIdentifier.length <= 160 &&
    Number.isSafeInteger(result.providerCallCount) &&
    result.providerCallCount >= 1 &&
    result.providerCallCount <= DOCUMENT_CHAT_MAX_PROVIDER_CALLS
  );
}

function toFailureCode(error: unknown): DocumentChatFailureCode {
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

async function loadBoundedConversationHistory(
  admin: DocumentChatWorkerAdminClient,
  conversationId: string,
): Promise<readonly DocumentChatHistoryMessage[]> {
  const history = await admin.rpc("get_document_chat_worker_history", {
    target_conversation_id: conversationId,
  });
  if (history.error) throw new DocumentSummarySourceSelectionError();
  const messages = (history.data ?? []).flatMap((message) => {
    if ((message.role !== "user" && message.role !== "assistant") || !message.content?.trim()) return [];
    return [{ role: message.role, content: message.content } satisfies DocumentChatHistoryMessage];
  });
  if (!messages.length) throw new DocumentSummarySourceSelectionError();
  return messages.slice(-DOCUMENT_CHAT_MAX_HISTORY_MESSAGES);
}

async function markMessageFailed({
  admin,
  job,
  workerIdentity,
  errorCode,
}: {
  admin: DocumentChatWorkerAdminClient;
  job: ClaimedDocumentChatMessage;
  workerIdentity: string;
  errorCode: DocumentChatFailureCode;
}): Promise<void> {
  const failed = await admin.rpc("fail_document_chat_message", {
    target_message_id: job.message_id,
    expected_worker_identity: workerIdentity,
    safe_error_code: errorCode,
  });
  if (failed.error || !failed.data) throw new Error("Document chat worker could not record a job failure.");
}

async function generateResponse({
  admin,
  job,
  provider,
}: {
  admin: DocumentChatWorkerAdminClient;
  job: ClaimedDocumentChatMessage;
  provider: DocumentChatProvider;
}) {
  const language = documentChatLanguageSchema.safeParse(job.language);
  if (!language.success) throw new DocumentSummarySourceSelectionError();
  const [history, sourceChunks] = await Promise.all([
    loadBoundedConversationHistory(admin, job.conversation_id),
    loadProcessedDocumentSourceChunks(admin, { documentId: job.document_id, householdId: job.household_id }),
  ]);
  const selection = selectDocumentSummarySources(job.document_id, sourceChunks, {
    maxSourceChunks: DOCUMENT_CHAT_MAX_SOURCE_CHUNKS,
    maxSourceCharacters: DOCUMENT_CHAT_MAX_SOURCE_CHARACTERS,
    maxSourceBatches: 1,
    maxChunksPerBatch: DOCUMENT_CHAT_MAX_SOURCE_CHUNKS,
    maxCharactersPerBatch: DOCUMENT_CHAT_MAX_SOURCE_CHARACTERS,
  });
  const sources = selection.batches.flatMap((batch) => batch.sources);
  const result = await provider.answer({
    language: language.data as DocumentChatLanguage,
    prompt: buildDocumentChatPrompt({ language: language.data, history, selection, sources }),
  });
  if (!isSafeProviderMetadata(result)) throw new DocumentSummarySourceReferenceError();
  const output = parseDocumentChatOutput(result.answer);
  if (!output) throw new DocumentSummarySourceReferenceError();
  if (selection.sourceCoverage === "full" && output.resultType === "partial_coverage") {
    throw new DocumentSummarySourceReferenceError();
  }
  const resultType =
    selection.sourceCoverage === "partial" && output.resultType === "grounded_answer"
      ? "partial_coverage"
      : output.resultType;
  const citations = resolveDocumentChatCitations({ ...output, resultType }, selection);
  if (citations.length !== output.sourceKeys.length) throw new DocumentSummarySourceReferenceError();
  return { result, output: { ...output, resultType }, citations, selection };
}

async function processClaimedMessage({
  admin,
  job,
  provider,
  workerIdentity,
}: {
  admin: DocumentChatWorkerAdminClient;
  job: ClaimedDocumentChatMessage;
  provider: DocumentChatProvider;
  workerIdentity: string;
}): Promise<{ outcome: "completed" } | { outcome: "failed"; failureCode: DocumentChatFailureCode }> {
  let failureCode: DocumentChatFailureCode = "document_unavailable";
  try {
    const generated = await generateResponse({ admin, job, provider });
    const completed = await admin.rpc("complete_document_chat_message", {
      target_message_id: job.message_id,
      expected_worker_identity: workerIdentity,
      completed_content: generated.output.answer,
      completed_result_type: generated.output.resultType,
      completed_citations: toStoredDocumentChatCitations(generated.citations),
      completed_source_coverage: generated.selection.sourceCoverage,
      completed_source_item_count: generated.selection.selectedChunkCount,
      completed_source_character_count: generated.selection.selectedCharacterCount,
      completed_provider: generated.result.provider,
      completed_model_identifier: generated.result.modelIdentifier,
      completed_provider_call_count: generated.result.providerCallCount,
    });
    if (!completed.error && completed.data) return { outcome: "completed" };
  } catch (error) {
    failureCode = toFailureCode(error);
  }
  await markMessageFailed({ admin, job, workerIdentity, errorCode: failureCode });
  return { outcome: "failed", failureCode };
}

/** Processes a small aggregate-only chat batch under ETH-017's worker secret. */
export async function runDocumentChatBatch(
  requestedLimit = DOCUMENT_CHAT_BATCH_LIMIT,
  dependencies: DocumentChatRunnerDependencies = {},
): Promise<DocumentChatBatchResult> {
  const limit = Math.min(Math.max(1, requestedLimit), DOCUMENT_CHAT_BATCH_LIMIT);
  const admin = dependencies.adminClient ?? createSupabaseAdminClient();
  const provider = dependencies.provider ?? createOpenAiDocumentChatProvider(requireOpenAiQuestionEnv());
  const workerIdentity = `document-chat-worker-${randomUUID()}`;
  const result: DocumentChatBatchResult = { processed: 0, completed: 0, failed: 0 };
  for (let index = 0; index < limit; index += 1) {
    const claimed = await admin.rpc("claim_next_document_chat_message", { worker_identity: workerIdentity });
    if (claimed.error) throw new Error("Document chat worker could not claim a job.");
    const job = claimed.data?.[0] as ClaimedDocumentChatMessage | undefined;
    if (!job) break;
    const outcome = await processClaimedMessage({ admin, job, provider, workerIdentity });
    revalidateDocumentChatPaths(job.document_id, job.conversation_id);
    result.processed += 1;
    if (outcome.outcome === "completed") result.completed += 1;
    else {
      result.failed += 1;
      result.failureCodes ??= {};
      result.failureCodes[outcome.failureCode] = (result.failureCodes[outcome.failureCode] ?? 0) + 1;
    }
  }
  return result;
}
