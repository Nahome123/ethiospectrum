import "server-only";

import { DOCUMENT_ALLOWED_MIME_TYPES } from "@/lib/documents/constants";
import type { Database } from "@/lib/supabase/types";
import { documentIdSchema } from "@/lib/validation/document";
import type { DocumentSummaryLanguage, DocumentSummaryStatus } from "./summaries/constants";
import { documentSummaryLanguageSchema } from "./summaries/schemas";
import {
  type DocumentSummaryStoredSourceReference,
  parseDocumentSummaryCitationLocation,
  parseStoredDocumentSummary,
} from "./summaries/storage";
import type { DocumentSummaryOutput } from "./summaries/types";
import {
  type DocumentSummaryReviewIssueCategory,
  documentSummaryQualityWarningsSchema,
  documentSummaryReviewSubmissionSchema,
  parseDocumentSummaryQualityChecks,
} from "./summary-quality-schemas";
import type { DocumentQuestionLanguage, DocumentQuestionStatus } from "./questions/constants";
import { documentQuestionLanguageSchema } from "./questions/schemas";
import {
  type DocumentChatLanguage,
  type DocumentChatMessageRole,
  type DocumentChatMessageStatus,
  type DocumentChatResultType,
} from "./chat/constants";
import { documentChatLanguageSchema } from "./chat/schemas";
import { normalizeDocumentCitation } from "./citations/normalization";
import { isRenderableStoredCitation, parseStoredCitationArray } from "./citations/schemas";
import type { DocumentCitation } from "./citations/types";
import {
  createServerComponentSupabaseClient,
  getCurrentHousehold,
  getCurrentSupabaseClaims,
} from "@/lib/supabase/server";

type HouseholdPermission = Database["public"]["Enums"]["household_permission"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

const uploadPermissions = new Set<HouseholdPermission>(["owner", "administrator", "member"]);
const archiveManagerPermissions = new Set<HouseholdPermission>(["owner", "administrator"]);

export type DocumentContext = {
  household: { id: string; name: string };
  userId: string;
  permission: HouseholdPermission;
  canUpload: boolean;
  canProcess: boolean;
};

export type DocumentProcessingDetails = {
  status: string;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  retryable: boolean;
};

export type DocumentSummaryDetails = {
  id: string;
  status: DocumentSummaryStatus;
  language: DocumentSummaryLanguage;
  retryable: boolean;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  sourceCoverage: "full" | "partial";
  structuredSummary: DocumentSummaryOutput | null;
  sourceReferences: readonly (DocumentCitation & {
    section: DocumentSummaryStoredSourceReference["section"] | null;
    itemIndex: number | null;
  })[];
};

export type DocumentSummaryEligibility = {
  canRequest: boolean;
  reason: "processing" | "ocr" | "unavailable" | null;
};

export type DocumentSummaryQualityDetails = {
  evaluation: {
    status: "pending" | "completed" | "failed";
    evaluatedAt: string | null;
    overallScore: number | null;
    groundingScore: number | null;
    citationCoverageScore: number | null;
    completenessScore: number | null;
    languageScore: number | null;
    safetyScore: number | null;
    citationStatements: number;
    citedStatements: number;
    fullDocumentAnalysed: boolean;
    partialDocument: boolean;
    sameDocumentReferencesValid: boolean;
    sourceReferencesValidJson: boolean;
    structuredSummaryValid: boolean;
    warnings: readonly string[];
  } | null;
  reviewStatus: "unreviewed" | "review_in_progress" | "approved" | "rejected" | "needs_revision";
  reviews: readonly {
    isOwnReview: boolean;
    reviewStatus: "review_in_progress" | "approved" | "rejected" | "needs_revision";
    overallRating: number | null;
    accuracyRating: number | null;
    completenessRating: number | null;
    citationRating: number | null;
    languageRating: number | null;
    issueCategories: readonly DocumentSummaryReviewIssueCategory[];
    feedback: string | null;
    submittedAt: string | null;
    updatedAt: string;
  }[];
};

export type DocumentQuestionDetails = {
  id: string;
  question: string;
  language: DocumentQuestionLanguage;
  status: DocumentQuestionStatus;
  retryable: boolean;
  completedAt: string | null;
  sourceCoverage: "full" | "partial";
  answer: string | null;
  sourceReferences: readonly DocumentCitation[];
};

export type DocumentChatEligibility = {
  available: boolean;
  reason: "processing" | "ocr" | "unavailable" | null;
};

export type DocumentChatConversationListItem = {
  id: string;
  language: DocumentChatLanguage;
  title: string;
  createdAt: string;
  lastMessageAt: string | null;
  messageCount: number;
  hasPendingResponse: boolean;
  hasFailedResponse: boolean;
};

export type DocumentChatConversationDetails = {
  id: string;
  language: DocumentChatLanguage;
  title: string;
  messages: readonly {
    id: string;
    role: DocumentChatMessageRole;
    status: DocumentChatMessageStatus;
    content: string | null;
    resultType: DocumentChatResultType | null;
    citations: readonly DocumentCitation[];
    createdAt: string;
    completedAt: string | null;
    retryable: boolean;
    sourceCoverage: "full" | "partial";
  }[];
};

export type DocumentOcrDetails = {
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  retryable: boolean;
};

export async function getDocumentContext(): Promise<DocumentContext | null> {
  const claims = await getCurrentSupabaseClaims();
  const household = await getCurrentHousehold();
  if (!claims || typeof claims.sub !== "string" || !household) return null;

  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("household_members")
    .select("permission")
    .eq("household_id", household.id)
    .eq("user_id", claims.sub)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;

  return {
    household,
    userId: claims.sub,
    permission: data.permission,
    canUpload: uploadPermissions.has(data.permission),
    canProcess: uploadPermissions.has(data.permission),
  };
}

export function canArchiveDocument(context: DocumentContext, document: Pick<DocumentRow, "uploaded_by">) {
  return (
    archiveManagerPermissions.has(context.permission) ||
    (context.canUpload && document.uploaded_by === context.userId)
  );
}

/** Keeps member controls aligned with the database's safe queue eligibility. */
export function canQueueDocumentProcessing(
  context: DocumentContext,
  document: Pick<DocumentRow, "deleted_at" | "mime_type" | "processing_status" | "upload_status">,
  processingDetails: Pick<DocumentProcessingDetails, "retryable"> | null,
): boolean {
  if (
    !context.canProcess ||
    document.upload_status !== "uploaded" ||
    Boolean(document.deleted_at) ||
    !DOCUMENT_ALLOWED_MIME_TYPES.includes(document.mime_type)
  ) {
    return false;
  }

  if (document.processing_status === "not_started") return true;
  return document.processing_status === "failed" && processingDetails?.retryable === true;
}

/** OCR is restricted to an active, textless PDF and the same non-viewer roles. */
export function canQueueDocumentOcr(
  context: DocumentContext,
  document: Pick<DocumentRow, "deleted_at" | "mime_type" | "processing_status" | "upload_status">,
  ocrDetails: Pick<DocumentOcrDetails, "retryable" | "status"> | null,
): boolean {
  if (
    !context.canProcess ||
    document.upload_status !== "uploaded" ||
    document.deleted_at !== null ||
    document.mime_type !== "application/pdf" ||
    document.processing_status !== "needs_ocr"
  ) {
    return false;
  }
  return !ocrDetails || (ocrDetails.status === "failed" && ocrDetails.retryable);
}

/** Summary requests share the non-viewer household permission boundary with processing. */
export function canQueueDocumentSummary(
  context: DocumentContext,
  document: Pick<DocumentRow, "deleted_at" | "processing_status" | "upload_status">,
): boolean {
  return (
    context.canProcess &&
    document.upload_status === "uploaded" &&
    document.processing_status === "completed" &&
    document.deleted_at === null
  );
}

/** Reads a single derived availability flag without exposing extraction rows. */
export async function hasAccessibleDocumentExtraction(documentId: string): Promise<boolean> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_document_extraction_availability", {
    target_document_id: documentId,
  });
  return !error && data?.[0]?.has_sources === true;
}

/** Eligibility is determined from trusted document state and a narrow safe RPC. */
export async function getDocumentSummaryEligibility(
  context: DocumentContext,
  document: Pick<DocumentRow, "deleted_at" | "id" | "processing_status" | "upload_status">,
): Promise<DocumentSummaryEligibility> {
  if (document.processing_status === "needs_ocr") return { canRequest: false, reason: "ocr" };
  if (
    document.upload_status !== "uploaded" ||
    document.deleted_at !== null ||
    document.processing_status !== "completed"
  ) {
    return { canRequest: false, reason: "processing" };
  }

  if (!(await hasAccessibleDocumentExtraction(document.id))) {
    return { canRequest: false, reason: "unavailable" };
  }
  return { canRequest: context.canProcess, reason: context.canProcess ? null : "unavailable" };
}

/** Chat is document-eligible for every active member; only non-viewers can write. */
export async function getDocumentChatEligibility(
  document: Pick<DocumentRow, "deleted_at" | "id" | "processing_status" | "upload_status">,
): Promise<DocumentChatEligibility> {
  if (document.processing_status === "needs_ocr") return { available: false, reason: "ocr" };
  if (
    document.upload_status !== "uploaded" ||
    document.deleted_at !== null ||
    document.processing_status !== "completed"
  ) {
    return { available: false, reason: "processing" };
  }
  if (!(await hasAccessibleDocumentExtraction(document.id)))
    return { available: false, reason: "unavailable" };
  return { available: true, reason: null };
}

export async function getUploadDependents() {
  const context = await getDocumentContext();
  if (!context) return { context: null, dependents: [] };

  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("dependents")
    .select("id, first_name, preferred_name")
    .eq("household_id", context.household.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return { context, dependents: data ?? [] };
}

export async function getVisibleDocument(documentId: string) {
  const context = await getDocumentContext();
  if (!context) return null;

  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("documents")
    .select(
      "id, household_id, dependent_id, uploaded_by, title, original_filename, mime_type, file_size, document_type, processing_status, upload_status, created_at, deleted_at",
    )
    .eq("id", documentId)
    .eq("household_id", context.household.id)
    .maybeSingle();
  return data ? { context, document: data } : null;
}

export async function getDocumentDependentName(dependentId: string | null, householdId: string) {
  if (!dependentId) return null;
  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("dependents")
    .select("first_name, preferred_name")
    .eq("id", dependentId)
    .eq("household_id", householdId)
    .maybeSingle();
  return data ? data.preferred_name || data.first_name : null;
}

/** Reads only the job fields approved for a document detail page. */
export async function getDocumentProcessingDetails(
  documentId: string,
): Promise<DocumentProcessingDetails | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_document_processing_status", {
    target_document_id: documentId,
  });
  const processing = data?.[0];
  if (error || !processing) return null;
  return {
    status: processing.status,
    attemptCount: processing.attempt_count,
    startedAt: processing.started_at,
    completedAt: processing.completed_at,
    failedAt: processing.failed_at,
    retryable: processing.retryable,
  };
}

/** Reads only the reviewed, display-safe OCR lifecycle fields. */
export async function getDocumentOcrDetails(documentId: string): Promise<DocumentOcrDetails | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_document_ocr_status", {
    target_document_id: documentId,
  });
  const ocr = data?.[0];
  const status = ocr?.status;
  if (
    error ||
    !ocr ||
    (status !== "queued" &&
      status !== "processing" &&
      status !== "completed" &&
      status !== "failed" &&
      status !== "cancelled")
  ) {
    return null;
  }
  return {
    status,
    attemptCount: ocr.attempt_count,
    startedAt: ocr.started_at,
    completedAt: ocr.completed_at,
    failedAt: ocr.failed_at,
    retryable: ocr.retryable,
  };
}

/** Reads only reviewed, display-safe summary fields through summary RLS. */
export async function getDocumentSummaryDetails(
  documentId: string,
  language: DocumentSummaryLanguage,
  mimeType: string,
): Promise<DocumentSummaryDetails | null> {
  const validLanguage = documentSummaryLanguageSchema.safeParse(language);
  if (!validLanguage.success) return null;

  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("document_summaries")
    .select(
      "id, language, status, requested_at, started_at, completed_at, failed_at, attempt_count, max_attempts, source_coverage, structured_summary, source_references",
    )
    .eq("document_id", documentId)
    .eq("language", validLanguage.data)
    .maybeSingle();
  if (error || !data) return null;

  const status = ["queued", "generating", "completed", "failed"].find((item) => item === data.status);
  const sourceCoverage =
    data.source_coverage === "partial" ? "partial" : data.source_coverage === "full" ? "full" : null;
  if (!status || !sourceCoverage) return null;
  const sourceReferences =
    status === "completed" ? parseStoredCitationArray(data.source_references) : ([] as readonly unknown[]);

  return {
    id: data.id,
    status: status as DocumentSummaryStatus,
    language: validLanguage.data,
    retryable: data.status === "failed" && data.attempt_count < data.max_attempts,
    requestedAt: data.requested_at,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    failedAt: data.failed_at,
    sourceCoverage,
    structuredSummary:
      data.status === "completed" ? parseStoredDocumentSummary(data.structured_summary) : null,
    sourceReferences: sourceReferences.flatMap((reference, citationIndex) => {
      if (!isRenderableStoredCitation(reference)) return [];
      const location = parseDocumentSummaryCitationLocation(reference);
      return [
        {
          ...normalizeDocumentCitation({
            documentId,
            ownerId: data.id,
            ownerType: "document_summary",
            citationIndex,
            sourceNumber: citationIndex + 1,
            storedCitation: reference,
            mimeType,
            isPartialDocument: sourceCoverage === "partial",
          }),
          section: location?.section ?? null,
          itemIndex: location?.item_index ?? null,
        },
      ];
    }),
  };
}

/**
 * Maps quality results to a deliberately small display contract. RLS is the
 * authorization boundary; this parser additionally drops internal failures,
 * database identifiers, and any malformed JSON before Server Component render.
 */
export async function getDocumentSummaryQualityDetails(
  documentId: string,
  language: DocumentSummaryLanguage,
  currentUserId: string,
): Promise<DocumentSummaryQualityDetails> {
  const validLanguage = documentSummaryLanguageSchema.safeParse(language);
  const empty: DocumentSummaryQualityDetails = { evaluation: null, reviewStatus: "unreviewed", reviews: [] };
  if (!validLanguage.success) return empty;

  const supabase = await createServerComponentSupabaseClient();
  const summaryResult = await supabase
    .from("document_summaries")
    .select("id")
    .eq("document_id", documentId)
    .eq("language", validLanguage.data)
    .eq("status", "completed")
    .maybeSingle();
  if (summaryResult.error || !summaryResult.data) return empty;

  const [evaluationResult, reviewsResult] = await Promise.all([
    supabase
      .from("document_summary_evaluations")
      .select(
        "status, evaluated_at, overall_score, grounding_score, citation_coverage_score, completeness_score, language_score, safety_score, checks, warnings",
      )
      .eq("summary_id", summaryResult.data.id)
      .maybeSingle(),
    supabase
      .from("document_summary_reviews")
      .select(
        "reviewed_by, review_status, overall_rating, accuracy_rating, completeness_rating, citation_rating, language_rating, issue_categories, feedback, submitted_at, updated_at",
      )
      .eq("summary_id", summaryResult.data.id)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(12),
  ]);

  const evaluationRow = evaluationResult.data;
  const checks = evaluationRow ? parseDocumentSummaryQualityChecks(evaluationRow.checks) : null;
  const warnings = evaluationRow
    ? documentSummaryQualityWarningsSchema.safeParse(evaluationRow.warnings)
    : null;
  const evaluationStatus = (["pending", "completed", "failed"] as const).find(
    (status) => status === evaluationRow?.status,
  );
  const scores = evaluationRow
    ? [
        evaluationRow.overall_score,
        evaluationRow.grounding_score,
        evaluationRow.citation_coverage_score,
        evaluationRow.completeness_score,
        evaluationRow.language_score,
        evaluationRow.safety_score,
      ]
    : [];
  const evaluation =
    evaluationRow &&
    evaluationStatus &&
    warnings?.success &&
    (evaluationStatus !== "completed" || (checks !== null && scores.every((score) => score !== null)))
      ? {
          status: evaluationStatus,
          evaluatedAt: evaluationRow.evaluated_at,
          overallScore: evaluationRow.overall_score,
          groundingScore: evaluationRow.grounding_score,
          citationCoverageScore: evaluationRow.citation_coverage_score,
          completenessScore: evaluationRow.completeness_score,
          languageScore: evaluationRow.language_score,
          safetyScore: evaluationRow.safety_score,
          citationStatements: checks?.citationStatements ?? 0,
          citedStatements: checks?.citedStatements ?? 0,
          fullDocumentAnalysed: checks?.fullDocumentAnalysed ?? false,
          partialDocument: checks?.partialDocument ?? false,
          sameDocumentReferencesValid: checks?.sameDocumentReferencesValid ?? false,
          sourceReferencesValidJson: checks?.sourceReferencesValidJson ?? false,
          structuredSummaryValid: checks?.structuredSummaryValid ?? false,
          warnings: warnings.data,
        }
      : null;

  const reviews = (reviewsResult.data ?? []).flatMap((review) => {
    const issueCategories = documentSummaryReviewSubmissionSchema.shape.issueCategories.safeParse(
      review.issue_categories,
    );
    const reviewStatus = ["review_in_progress", "approved", "rejected", "needs_revision"].find(
      (status) => status === review.review_status,
    );
    const ratings = [
      review.overall_rating,
      review.accuracy_rating,
      review.completeness_rating,
      review.citation_rating,
      review.language_rating,
    ];
    if (
      !issueCategories.success ||
      !reviewStatus ||
      ratings.some((rating) => rating !== null && (rating < 1 || rating > 5))
    ) {
      return [];
    }
    return [
      {
        isOwnReview: review.reviewed_by === currentUserId,
        reviewStatus: reviewStatus as "review_in_progress" | "approved" | "rejected" | "needs_revision",
        overallRating: review.overall_rating,
        accuracyRating: review.accuracy_rating,
        completenessRating: review.completeness_rating,
        citationRating: review.citation_rating,
        languageRating: review.language_rating,
        issueCategories: issueCategories.data,
        feedback: review.feedback,
        submittedAt: review.submitted_at,
        updatedAt: review.updated_at,
      },
    ];
  });
  const finalReview = reviews.find((review) => review.reviewStatus !== "review_in_progress");
  return {
    evaluation,
    reviewStatus: finalReview?.reviewStatus ?? (reviews.length ? "review_in_progress" : "unreviewed"),
    reviews,
  };
}

/**
 * Reads a small, display-safe recent Q&A list through the same parent-document
 * RLS boundary as summaries. Worker locks, provider metadata, and error codes
 * are deliberately excluded from this server-rendered contract.
 */
export async function getDocumentQuestionDetails(
  documentId: string,
  mimeType: string,
): Promise<readonly DocumentQuestionDetails[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_document_questions", { target_document_id: documentId });
  if (error || !data) return [];

  return data.flatMap((question) => {
    const language = documentQuestionLanguageSchema.safeParse(question.language);
    const status = ["queued", "answering", "completed", "failed"].find((item) => item === question.status);
    const sourceCoverage =
      question.source_coverage === "partial"
        ? "partial"
        : question.source_coverage === "full"
          ? "full"
          : null;
    if (!language.success || !status || !sourceCoverage) return [];
    const references = status === "completed" ? parseStoredCitationArray(question.source_references) : [];
    if (status === "completed" && !question.answer_text) return [];
    return [
      {
        id: question.question_id,
        question: question.question,
        language: language.data,
        status: status as DocumentQuestionStatus,
        retryable: question.retryable,
        completedAt: question.completed_at,
        sourceCoverage,
        answer: status === "completed" ? question.answer_text : null,
        sourceReferences: references.flatMap((reference, citationIndex) =>
          isRenderableStoredCitation(reference)
            ? [
                normalizeDocumentCitation({
                  documentId,
                  ownerId: question.question_id,
                  ownerType: "document_qa_answer",
                  citationIndex,
                  sourceNumber: citationIndex + 1,
                  storedCitation: reference,
                  mimeType,
                  isPartialDocument: sourceCoverage === "partial",
                }),
              ]
            : [],
        ),
      },
    ];
  });
}

/** Reads the safe, household-shared conversation list through its narrow RPC. */
export async function getDocumentChatConversations(
  documentId: string,
): Promise<readonly DocumentChatConversationListItem[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_document_chat_conversations", {
    target_document_id: documentId,
  });
  if (error || !data) return [];
  return data.flatMap((conversation) => {
    const language = documentChatLanguageSchema.safeParse(conversation.language);
    if (
      !language.success ||
      !conversation.conversation_id ||
      !conversation.title?.trim() ||
      !conversation.created_at ||
      !Number.isSafeInteger(conversation.message_count) ||
      conversation.message_count < 0
    ) {
      return [];
    }
    return [
      {
        id: conversation.conversation_id,
        language: language.data,
        title: conversation.title,
        createdAt: conversation.created_at,
        lastMessageAt: conversation.last_message_at ?? null,
        messageCount: conversation.message_count,
        hasPendingResponse: conversation.has_pending_response === true,
        hasFailedResponse: conversation.has_failed_response === true,
      },
    ];
  });
}

/** Drops malformed rows and all worker/provider metadata before Server Component render. */
export async function getDocumentChatConversationDetails(
  documentId: string,
  conversationId: string,
  mimeType: string,
): Promise<DocumentChatConversationDetails | null> {
  if (!documentIdSchema.safeParse(conversationId).success) return null;
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_document_chat_conversation", {
    target_document_id: documentId,
    target_conversation_id: conversationId,
  });
  if (error || !data?.length) return null;
  const first = data[0];
  const language = documentChatLanguageSchema.safeParse(first.language);
  if (!language.success || first.conversation_id !== conversationId || !first.title?.trim()) return null;
  const messages = data.flatMap((message) => {
    const role = (["user", "assistant"] as const).find((value) => value === message.role);
    const status = (["pending", "generating", "completed", "failed"] as const).find(
      (value) => value === message.status,
    );
    const resultType = (
      ["grounded_answer", "insufficient_evidence", "outside_document", "partial_coverage"] as const
    ).find((value) => value === message.result_type);
    const sourceCoverage = (["full", "partial"] as const).find((value) => value === message.source_coverage);
    const citations = message.status === "completed" ? parseStoredCitationArray(message.citations) : [];
    if (
      !role ||
      !status ||
      !sourceCoverage ||
      !message.message_id ||
      !message.created_at ||
      (status === "completed" && !message.content?.trim()) ||
      (role === "assistant" && status === "completed" && !resultType)
    ) {
      return [];
    }
    return [
      {
        id: message.message_id,
        role: role as DocumentChatMessageRole,
        status: status as DocumentChatMessageStatus,
        content: status === "completed" ? (message.content ?? null) : null,
        resultType: status === "completed" ? (resultType as DocumentChatResultType | null) : null,
        citations: citations.flatMap((citation, citationIndex) =>
          isRenderableStoredCitation(citation)
            ? [
                normalizeDocumentCitation({
                  documentId,
                  ownerId: message.message_id,
                  ownerType: "document_chat_message",
                  citationIndex,
                  sourceNumber: citationIndex + 1,
                  storedCitation: citation,
                  mimeType,
                  isPartialDocument: sourceCoverage === "partial",
                }),
              ]
            : [],
        ),
        createdAt: message.created_at,
        completedAt: message.completed_at ?? null,
        retryable: message.retryable === true,
        sourceCoverage: sourceCoverage as "full" | "partial",
      },
    ];
  });
  return messages.length
    ? { id: conversationId, language: language.data, title: first.title, messages }
    : null;
}
