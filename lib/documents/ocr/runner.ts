import "server-only";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { DOCUMENT_BUCKET } from "@/lib/documents/constants";
import { chunkDocumentSections, toDocumentProcessingPages } from "@/lib/documents/processing/text";
import type { Json } from "@/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOcrProviderEnv } from "@/lib/env/server";
import {
  DOCUMENT_OCR_BATCH_LIMIT,
  DOCUMENT_OCR_MAX_FILE_BYTES,
  type DocumentOcrFailureCode,
} from "./constants";
import { DocumentOcrError, isDocumentOcrError } from "./errors";
import { createOpenAiDocumentOcrProvider } from "./provider";
import { renderOcrPdfPages } from "./renderer";
import { createOcrSections } from "./text";
import type { DocumentOcrProvider, RenderedOcrPage } from "./types";

export type ClaimedDocumentOcrJob = {
  attempt_count: number;
  dependent_id: string | null;
  document_id: string;
  file_size: number;
  household_id: string;
  job_id: string;
  max_attempts: number;
  mime_type: string;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
};

type OcrPdfRenderer = (bytes: Uint8Array) => AsyncIterable<RenderedOcrPage>;

export type DocumentOcrBatchResult = {
  processed: number;
  completed: number;
  failed: number;
};

export type DocumentOcrRunnerDependencies = {
  provider?: DocumentOcrProvider;
  renderPages?: OcrPdfRenderer;
};

function trustedStoragePath(job: ClaimedDocumentOcrJob): string {
  return `households/${job.household_id}/dependents/${job.dependent_id ?? "unassigned"}/documents/${job.document_id}/${job.original_filename}`;
}

function hasTrustedStorageMetadata(job: ClaimedDocumentOcrJob): boolean {
  return (
    job.storage_bucket === DOCUMENT_BUCKET &&
    job.storage_path === trustedStoragePath(job) &&
    job.mime_type === "application/pdf" &&
    job.file_size > 0 &&
    job.file_size <= DOCUMENT_OCR_MAX_FILE_BYTES
  );
}

function asPageRows(pages: ReturnType<typeof toDocumentProcessingPages>): Json[] {
  return pages.map((page) => ({
    page_number: page.pageNumber,
    content: page.content,
    character_count: page.characterCount,
  }));
}

function asChunkRows(chunks: ReturnType<typeof chunkDocumentSections>): Json[] {
  return chunks.map((chunk) => ({
    page_number: chunk.pageNumber,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    character_count: chunk.characterCount,
    token_estimate: chunk.tokenEstimate,
  }));
}

async function markJobFailed({
  admin,
  errorCode,
  job,
  workerIdentity,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  errorCode: DocumentOcrFailureCode;
  job: ClaimedDocumentOcrJob;
  workerIdentity: string;
}): Promise<void> {
  const failed = await admin.rpc("fail_document_ocr_job", {
    target_job_id: job.job_id,
    expected_worker_identity: workerIdentity,
    safe_error_code: errorCode,
  });
  if (failed.error || !failed.data) throw new Error("Document OCR worker could not record a job failure.");
}

async function processClaimedJob({
  admin,
  job,
  provider,
  renderPages,
  workerIdentity,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  job: ClaimedDocumentOcrJob;
  provider: DocumentOcrProvider;
  renderPages: OcrPdfRenderer;
  workerIdentity: string;
}): Promise<"completed" | "failed"> {
  let errorCode: DocumentOcrFailureCode = "ocr_provider_failed";
  try {
    if (!hasTrustedStorageMetadata(job)) {
      errorCode = "file_validation_failed";
    } else {
      const downloaded = await admin.storage.from(DOCUMENT_BUCKET).download(job.storage_path);
      if (!downloaded.data || downloaded.error || downloaded.data.size !== job.file_size) {
        errorCode = "storage_download_failed";
      } else {
        const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
        if (bytes.byteLength !== job.file_size || bytes.byteLength > DOCUMENT_OCR_MAX_FILE_BYTES) {
          errorCode = "file_validation_failed";
        } else {
          const transcribedPages: { pageNumber: number; text: string }[] = [];
          let providerMetadata: { provider: "openai"; modelIdentifier: string } | undefined;
          let previousPageNumber = 0;
          for await (const page of renderPages(bytes)) {
            if (!Number.isInteger(page.pageNumber) || page.pageNumber <= previousPageNumber) {
              throw new DocumentOcrError("ocr_render_failed");
            }
            previousPageNumber = page.pageNumber;
            const response = await provider.transcribePage({
              imageBytes: page.imageBytes,
              pageNumber: page.pageNumber,
            });
            if (
              providerMetadata &&
              (providerMetadata.provider !== response.provider ||
                providerMetadata.modelIdentifier !== response.modelIdentifier)
            ) {
              throw new DocumentOcrError("ocr_provider_failed");
            }
            providerMetadata = { provider: response.provider, modelIdentifier: response.modelIdentifier };
            transcribedPages.push({ pageNumber: page.pageNumber, text: response.text });
          }
          const sections = createOcrSections(transcribedPages);
          const pages = toDocumentProcessingPages(sections);
          const chunks = chunkDocumentSections(sections);
          if (!providerMetadata) throw new DocumentOcrError("ocr_output_empty");
          const completed = await admin.rpc("complete_document_ocr_job", {
            target_job_id: job.job_id,
            expected_worker_identity: workerIdentity,
            completed_provider: providerMetadata.provider,
            completed_model_identifier: providerMetadata.modelIdentifier,
            page_rows: asPageRows(pages),
            chunk_rows: asChunkRows(chunks),
          });
          if (!completed.error && completed.data) return "completed";
        }
      }
    }
  } catch (error) {
    errorCode = isDocumentOcrError(error) ? error.code : "ocr_provider_failed";
  }

  await markJobFailed({ admin, errorCode, job, workerIdentity });
  return "failed";
}

function revalidateDocumentOcrPaths(documentId: string): void {
  for (const locale of ["en", "am", "es"]) {
    revalidatePath(`/${locale}/documents`);
    revalidatePath(`/${locale}/documents/${documentId}`);
    revalidatePath(`/${locale}/dashboard`);
  }
}

/** Runs only a small, secret-protected server-side batch and returns no document data. */
export async function runDocumentOcrBatch(
  requestedLimit = DOCUMENT_OCR_BATCH_LIMIT,
  dependencies: DocumentOcrRunnerDependencies = {},
): Promise<DocumentOcrBatchResult> {
  const limit = Math.min(Math.max(1, requestedLimit), DOCUMENT_OCR_BATCH_LIMIT);
  const provider = dependencies.provider ?? createOpenAiDocumentOcrProvider(requireOcrProviderEnv());
  const renderPages = dependencies.renderPages ?? renderOcrPdfPages;
  const admin = createSupabaseAdminClient();
  const workerIdentity = `document-ocr-${randomUUID()}`;
  const result: DocumentOcrBatchResult = { processed: 0, completed: 0, failed: 0 };

  for (let index = 0; index < limit; index += 1) {
    const claimed = await admin.rpc("claim_next_document_ocr_job", { worker_identity: workerIdentity });
    if (claimed.error) throw new Error("Document OCR worker could not claim a job.");
    const job = claimed.data?.[0] as ClaimedDocumentOcrJob | undefined;
    if (!job) break;

    const outcome = await processClaimedJob({ admin, job, provider, renderPages, workerIdentity });
    revalidateDocumentOcrPaths(job.document_id);
    result.processed += 1;
    if (outcome === "completed") result.completed += 1;
    if (outcome === "failed") result.failed += 1;
  }

  return result;
}
