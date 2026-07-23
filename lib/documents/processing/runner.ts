import "server-only";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { DOCUMENT_BUCKET } from "@/lib/documents/constants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json, Database } from "@/lib/supabase/database.types";
import { DOCUMENT_PROCESSING_MAX_FILE_BYTES, type DocumentProcessingFailureCode } from "./constants";
import { isDocumentProcessingError } from "./errors";
import { extractDocumentText } from "./parsers";
import { chunkDocumentSections, toDocumentProcessingPages } from "./text";

const DOCUMENT_PROCESSING_BATCH_LIMIT = 3;

type ClaimedDocumentProcessingJob =
  Database["public"]["Functions"]["claim_next_document_processing_job"]["Returns"][number];

type ProcessingOutcome = "completed" | "unsupported" | "needs_ocr" | "failed" | "skipped";

export type DocumentProcessingBatchResult = {
  processed: number;
  completed: number;
  unsupported: number;
  needsOcr: number;
  failed: number;
};

function trustedStoragePath(job: ClaimedDocumentProcessingJob): string {
  return `households/${job.household_id}/dependents/${job.dependent_id ?? "unassigned"}/documents/${job.document_id}/${job.original_filename}`;
}

function hasTrustedStorageMetadata(job: ClaimedDocumentProcessingJob): boolean {
  return (
    job.storage_bucket === DOCUMENT_BUCKET &&
    job.storage_path === trustedStoragePath(job) &&
    job.file_size > 0 &&
    job.file_size <= DOCUMENT_PROCESSING_MAX_FILE_BYTES
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
  errorCode: DocumentProcessingFailureCode;
  job: ClaimedDocumentProcessingJob;
  workerIdentity: string;
}): Promise<void> {
  await admin.rpc("fail_document_processing_job", {
    target_job_id: job.job_id,
    expected_worker_identity: workerIdentity,
    safe_error_code: errorCode,
  });
}

async function processClaimedJob({
  admin,
  job,
  workerIdentity,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  job: ClaimedDocumentProcessingJob;
  workerIdentity: string;
}): Promise<ProcessingOutcome> {
  try {
    if (!hasTrustedStorageMetadata(job)) {
      await markJobFailed({ admin, job, workerIdentity, errorCode: "file_validation_failed" });
      return "failed";
    }

    const downloaded = await admin.storage.from(DOCUMENT_BUCKET).download(job.storage_path);
    if (!downloaded.data || downloaded.error || downloaded.data.size !== job.file_size) {
      await markJobFailed({ admin, job, workerIdentity, errorCode: "storage_download_failed" });
      return "failed";
    }

    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    if (bytes.byteLength !== job.file_size || bytes.byteLength > DOCUMENT_PROCESSING_MAX_FILE_BYTES) {
      await markJobFailed({ admin, job, workerIdentity, errorCode: "file_validation_failed" });
      return "failed";
    }

    const extraction = await extractDocumentText({
      bytes,
      filename: job.original_filename,
      mimeType: job.mime_type,
    });
    const pages = extraction.outcome === "completed" ? toDocumentProcessingPages(extraction.sections) : [];
    const chunks = extraction.outcome === "completed" ? chunkDocumentSections(extraction.sections) : [];
    const completed = await admin.rpc("complete_document_processing_job", {
      target_job_id: job.job_id,
      expected_worker_identity: workerIdentity,
      final_status: extraction.outcome,
      page_rows: asPageRows(pages),
      chunk_rows: asChunkRows(chunks),
    });
    if (completed.error || !completed.data) {
      await markJobFailed({ admin, job, workerIdentity, errorCode: "text_extraction_failed" });
      return "failed";
    }
    return extraction.outcome;
  } catch (error) {
    const errorCode = isDocumentProcessingError(error) ? error.code : "text_extraction_failed";
    await markJobFailed({ admin, job, workerIdentity, errorCode });
    return "failed";
  }
}

function revalidateDocumentProcessingPaths(documentId: string): void {
  for (const locale of ["en", "am", "es"]) {
    revalidatePath(`/${locale}/documents`);
    revalidatePath(`/${locale}/documents/${documentId}`);
    revalidatePath(`/${locale}/dashboard`);
  }
}

/**
 * Runs a deliberately small batch. The internal route controls invocation;
 * this module never returns document contents, URLs, or technical errors.
 */
export async function runDocumentProcessingBatch(
  requestedLimit = DOCUMENT_PROCESSING_BATCH_LIMIT,
): Promise<DocumentProcessingBatchResult> {
  const limit = Math.min(Math.max(1, requestedLimit), DOCUMENT_PROCESSING_BATCH_LIMIT);
  const admin = createSupabaseAdminClient();
  const workerIdentity = `document-processor-${randomUUID()}`;
  const result: DocumentProcessingBatchResult = {
    processed: 0,
    completed: 0,
    unsupported: 0,
    needsOcr: 0,
    failed: 0,
  };

  for (let index = 0; index < limit; index += 1) {
    const claimed = await admin.rpc("claim_next_document_processing_job", {
      worker_identity: workerIdentity,
    });
    if (claimed.error) {
      throw new Error("Document processing worker could not claim a job.");
    }
    const job = claimed.data?.[0];
    if (!job) break;

    const outcome = await processClaimedJob({ admin, job, workerIdentity });
    revalidateDocumentProcessingPaths(job.document_id);
    if (outcome === "skipped") continue;
    result.processed += 1;
    if (outcome === "completed") result.completed += 1;
    if (outcome === "unsupported") result.unsupported += 1;
    if (outcome === "needs_ocr") result.needsOcr += 1;
    if (outcome === "failed") result.failed += 1;
  }

  return result;
}
