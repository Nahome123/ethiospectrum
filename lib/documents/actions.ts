"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { createDocumentMetadataSchema, documentIdSchema } from "@/lib/validation/document";
import { DOCUMENT_BUCKET } from "./constants";
import type { DocumentActionState } from "./action-state";
import { normalizeDocumentFilename } from "./path";
import { canArchiveDocument, getDocumentContext } from "./server";

function metadataInput(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    dependentId: String(formData.get("dependentId") ?? ""),
    documentType: String(formData.get("documentType") ?? ""),
    originalFilename: String(formData.get("originalFilename") ?? ""),
    mimeType: String(formData.get("mimeType") ?? ""),
    fileSize: String(formData.get("fileSize") ?? ""),
  };
}

async function documentTranslations(locale: AppLocale) {
  const t = await getTranslations({ locale, namespace: "documents" });
  return {
    t,
    schema: createDocumentMetadataSchema({
      title: t("titleError"),
      text: t("textError"),
      category: t("categoryError"),
      dependent: t("dependentError"),
      filename: t("filenameError"),
      unsupportedFile: t("unsupportedFile"),
      fileTooLarge: t("fileTooLarge"),
      emptyFile: t("emptyFile"),
    }),
  };
}

async function loadOwnedPendingDocument(documentId: string) {
  const context = await getDocumentContext();
  if (!context || !context.canUpload) return null;
  const supabase = await createServerActionSupabaseClient();
  const { data } = await supabase
    .from("documents")
    .select(
      "id, household_id, uploaded_by, storage_bucket, storage_path, mime_type, file_size, upload_status, deleted_at",
    )
    .eq("id", documentId)
    .eq("household_id", context.household.id)
    .eq("uploaded_by", context.userId)
    .maybeSingle();
  return data ? { context, supabase, document: data } : null;
}

function objectMatchesExpectedMetadata(
  object: { size?: number; contentType?: string; metadata?: { size?: number; mimetype?: string } },
  expected: { file_size: number; mime_type: string },
) {
  const size = object.size ?? object.metadata?.size;
  const contentType = (object.contentType ?? object.metadata?.mimetype ?? "").split(";", 1)[0];
  return size === expected.file_size && contentType === expected.mime_type;
}

function revalidateDocumentPaths(locale: AppLocale, documentId?: string) {
  revalidatePath(`/${locale}/documents`);
  revalidatePath(`/${locale}/dashboard`);
  if (documentId) revalidatePath(`/${locale}/documents/${documentId}`);
}

export async function prepareDocumentUploadAction(
  locale: AppLocale,
  _state: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  void _state;
  const { t, schema } = await documentTranslations(locale);
  const parsed = schema.safeParse(metadataInput(formData));
  const context = await getDocumentContext();
  if (!parsed.success) return { status: "error", message: t("validationError") };
  if (!context?.canUpload) return { status: "error", message: t("accessDenied") };

  const safeFilename = normalizeDocumentFilename(parsed.data.originalFilename);
  if (!safeFilename) return { status: "error", message: t("unsupportedFile") };
  const supabase = await createServerActionSupabaseClient();
  if (parsed.data.dependentId) {
    const { data: dependent } = await supabase
      .from("dependents")
      .select("id")
      .eq("id", parsed.data.dependentId)
      .eq("household_id", context.household.id)
      .is("archived_at", null)
      .maybeSingle();
    if (!dependent) return { status: "error", message: t("dependentError") };
  }

  const { data: document, error: insertError } = await supabase
    .from("documents")
    .insert({
      household_id: context.household.id,
      dependent_id: parsed.data.dependentId,
      uploaded_by: context.userId,
      title: parsed.data.title,
      original_filename: safeFilename,
      storage_bucket: DOCUMENT_BUCKET,
      // The database trigger replaces this required-column placeholder with the
      // exact path derived from its generated document UUID and trusted context.
      storage_path: "pending",
      mime_type: parsed.data.mimeType,
      file_size: parsed.data.fileSize,
      document_type: parsed.data.documentType,
      processing_status: "not_started",
      upload_status: "pending",
    })
    .select("id, storage_path")
    .single();
  if (insertError || !document) return { status: "error", message: t("prepareError") };

  const signedUpload = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUploadUrl(document.storage_path, { upsert: false });
  if (signedUpload.error || !signedUpload.data) {
    const { data: failedDocument } = await supabase
      .from("documents")
      .update({ upload_status: "failed" })
      .eq("id", document.id)
      .eq("household_id", context.household.id)
      .eq("uploaded_by", context.userId)
      .eq("upload_status", "pending")
      .select("id")
      .maybeSingle();
    if (failedDocument) revalidateDocumentPaths(locale, failedDocument.id);
    return { status: "error", message: t("prepareError") };
  }

  return {
    status: "ready",
    documentId: document.id,
    storagePath: document.storage_path,
    uploadToken: signedUpload.data.token,
  };
}

export async function completeDocumentUploadAction(
  locale: AppLocale,
  documentId: string,
): Promise<DocumentActionState> {
  const { t } = await documentTranslations(locale);
  if (!documentIdSchema.safeParse(documentId).success) return { status: "error", message: t("uploadFailed") };
  const record = await loadOwnedPendingDocument(documentId);
  if (!record || record.document.upload_status !== "pending" || record.document.deleted_at) {
    return { status: "error", message: t("uploadFailed") };
  }

  const objectResult = await record.supabase.storage
    .from(record.document.storage_bucket)
    .info(record.document.storage_path);
  if (
    objectResult.error ||
    !objectResult.data ||
    !objectMatchesExpectedMetadata(objectResult.data, record.document)
  ) {
    const { data: failedDocument } = await record.supabase
      .from("documents")
      .update({ upload_status: "failed" })
      .eq("id", record.document.id)
      .eq("household_id", record.context.household.id)
      .eq("uploaded_by", record.context.userId)
      .eq("upload_status", "pending")
      .select("id")
      .maybeSingle();
    if (failedDocument) revalidateDocumentPaths(locale, failedDocument.id);
    return { status: "error", message: t("uploadFailed") };
  }

  const { data: completedDocument, error } = await record.supabase
    .from("documents")
    .update({ upload_status: "uploaded" })
    .eq("id", record.document.id)
    .eq("household_id", record.context.household.id)
    .eq("uploaded_by", record.context.userId)
    .eq("upload_status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !completedDocument) return { status: "error", message: t("uploadFailed") };
  revalidateDocumentPaths(locale, record.document.id);
  return { status: "complete", documentId: completedDocument.id };
}

export async function markDocumentUploadFailedAction(
  locale: AppLocale,
  documentId: string,
): Promise<DocumentActionState> {
  const { t } = await documentTranslations(locale);
  if (!documentIdSchema.safeParse(documentId).success) return { status: "error", message: t("uploadFailed") };
  const record = await loadOwnedPendingDocument(documentId);
  if (!record || record.document.upload_status !== "pending" || record.document.deleted_at) {
    return { status: "error", message: t("uploadFailed") };
  }
  const { data: failedDocument, error } = await record.supabase
    .from("documents")
    .update({ upload_status: "failed" })
    .eq("id", record.document.id)
    .eq("household_id", record.context.household.id)
    .eq("uploaded_by", record.context.userId)
    .eq("upload_status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !failedDocument) return { status: "error", message: t("uploadFailed") };
  revalidateDocumentPaths(locale, record.document.id);
  return { status: "error", message: t("uploadFailed") };
}

export async function archiveDocumentAction(
  locale: AppLocale,
  documentId: string,
  _state: DocumentActionState,
): Promise<DocumentActionState> {
  void _state;
  const { t } = await documentTranslations(locale);
  if (!documentIdSchema.safeParse(documentId).success) return { status: "error", message: t("archiveError") };
  const context = await getDocumentContext();
  if (!context) return { status: "error", message: t("notFound") };
  const supabase = await createServerActionSupabaseClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id, household_id, uploaded_by, upload_status, deleted_at")
    .eq("id", documentId)
    .eq("household_id", context.household.id)
    .maybeSingle();
  if (
    !document ||
    document.deleted_at ||
    document.upload_status === "archived" ||
    !canArchiveDocument(context, document)
  ) {
    return { status: "error", message: t("notFound") };
  }
  const { data: archivedDocument, error } = await supabase
    .from("documents")
    .update({ upload_status: "archived", deleted_at: new Date().toISOString() })
    .eq("id", document.id)
    .eq("household_id", context.household.id)
    .eq("upload_status", document.upload_status)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error || !archivedDocument) return { status: "error", message: t("archiveError") };
  revalidateDocumentPaths(locale, document.id);
  redirect(`/${locale}/documents`);
}
