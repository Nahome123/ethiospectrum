"use server";

import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { DOCUMENT_BUCKET } from "@/lib/documents/constants";
import { normalizeDocumentFilename } from "@/lib/documents/path";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { createDocumentMetadataSchema } from "@/lib/validation/document";
import { uuidSchema } from "@/lib/validation/services";
import type { RequestDocumentActionState } from "./action-state";
import { revalidateServiceRequest } from "./revalidate";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function documentMessages(locale: AppLocale) {
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

/**
 * Prepares a private upload linked to one service request. The household and
 * dependent are taken from the request; the database verifies that the caller
 * is a household member allowed to upload or the request's assigned specialist.
 */
export async function prepareRequestDocumentUploadAction(
  locale: AppLocale,
  requestId: string,
  _state: RequestDocumentActionState,
  formData: FormData,
): Promise<RequestDocumentActionState> {
  const { t, schema } = await documentMessages(locale);
  const id = uuidSchema.safeParse(requestId);
  const parsed = schema.safeParse({
    title: field(formData, "title"),
    dependentId: "",
    documentType: field(formData, "documentType") || "education",
    originalFilename: field(formData, "originalFilename"),
    mimeType: field(formData, "mimeType"),
    fileSize: field(formData, "fileSize"),
  });
  if (!id.success || !parsed.success) return { status: "error", message: t("validationError") };
  const safeFilename = normalizeDocumentFilename(parsed.data.originalFilename);
  if (!safeFilename) return { status: "error", message: t("unsupportedFile") };

  const supabase = await createServerActionSupabaseClient();
  const [{ data: detail }, { data: claims }] = await Promise.all([
    supabase.rpc("get_service_request_detail", { target_request_id: id.data }),
    supabase.auth.getClaims(),
  ]);
  const request = detail?.[0];
  const userId = claims?.claims?.sub;
  if (!request || !request.can_upload || typeof userId !== "string") {
    return { status: "error", message: t("accessDenied") };
  }

  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      household_id: request.household_id,
      dependent_id: request.dependent_id,
      service_request_id: request.id,
      uploaded_by: userId,
      title: parsed.data.title,
      original_filename: safeFilename,
      storage_bucket: DOCUMENT_BUCKET,
      storage_path: "pending",
      mime_type: parsed.data.mimeType,
      file_size: parsed.data.fileSize,
      document_type: parsed.data.documentType,
      processing_status: "not_started",
      upload_status: "pending",
    })
    .select("id, storage_path")
    .single();
  if (error || !document) return { status: "error", message: t("prepareError") };

  const signed = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUploadUrl(document.storage_path, { upsert: false });
  if (signed.error || !signed.data) {
    await supabase
      .from("documents")
      .update({ upload_status: "failed" })
      .eq("id", document.id)
      .eq("upload_status", "pending");
    return { status: "error", message: t("prepareError") };
  }
  return {
    status: "ready",
    documentId: document.id,
    storagePath: document.storage_path,
    uploadToken: signed.data.token,
  };
}

export async function completeRequestDocumentUploadAction(
  locale: AppLocale,
  requestId: string,
  documentId: string,
): Promise<RequestDocumentActionState> {
  const { t } = await documentMessages(locale);
  if (!uuidSchema.safeParse(requestId).success || !uuidSchema.safeParse(documentId).success) {
    return { status: "error", message: t("uploadFailed") };
  }
  const supabase = await createServerActionSupabaseClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id, storage_bucket, storage_path, mime_type, file_size, upload_status, service_request_id")
    .eq("id", documentId)
    .eq("service_request_id", requestId)
    .maybeSingle();
  if (!document || document.upload_status !== "pending")
    return { status: "error", message: t("uploadFailed") };

  const info = await supabase.storage.from(document.storage_bucket).info(document.storage_path);
  const size = info.data?.size ?? (info.data?.metadata as { size?: number } | undefined)?.size;
  const contentType = (
    info.data?.contentType ??
    (info.data?.metadata as { mimetype?: string } | undefined)?.mimetype ??
    ""
  ).split(";", 1)[0];
  if (info.error || size !== document.file_size || contentType !== document.mime_type) {
    await supabase
      .from("documents")
      .update({ upload_status: "failed" })
      .eq("id", document.id)
      .eq("upload_status", "pending");
    return { status: "error", message: t("uploadFailed") };
  }
  const { error } = await supabase
    .from("documents")
    .update({ upload_status: "uploaded" })
    .eq("id", document.id)
    .eq("upload_status", "pending");
  if (error) return { status: "error", message: t("uploadFailed") };
  revalidateServiceRequest(locale, requestId);
  return { status: "complete", documentId: document.id };
}
