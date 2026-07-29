"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { documentIdSchema } from "@/lib/validation/document";
import { getDocumentContext } from "./server";
import type { DocumentChatActionState } from "./chat-action-state";
import { documentChatLanguageSchema, documentChatMessageInputSchema } from "./chat/schemas";

function revalidateDocumentChatPaths(documentId: string, conversationId?: string): void {
  for (const locale of ["en", "am", "es"]) {
    revalidatePath(`/${locale}/documents`);
    revalidatePath(`/${locale}/documents/${documentId}`);
    revalidatePath(`/${locale}/documents/${documentId}/chat`);
    if (conversationId) revalidatePath(`/${locale}/documents/${documentId}/chat/${conversationId}`);
  }
}

/** Creates the conversation, initial user message, and pending assistant work in one RPC. */
export async function createDocumentChatConversationAction(
  locale: AppLocale,
  documentId: string,
  _state: DocumentChatActionState,
  formData: FormData,
): Promise<DocumentChatActionState> {
  void _state;
  const t = await getTranslations({ locale, namespace: "chat" });
  const language = documentChatLanguageSchema.safeParse(formData.get("language"));
  const input = documentChatMessageInputSchema.safeParse({
    message: formData.get("message"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!documentIdSchema.safeParse(documentId).success || !language.success || !input.success) {
    return { status: "error", message: t("unavailable") };
  }
  const context = await getDocumentContext();
  if (!context?.canProcess) return { status: "error", message: t("accessDenied") };
  const supabase = await createServerActionSupabaseClient();
  const result = await supabase.rpc("create_document_chat_conversation", {
    target_document_id: documentId,
    requested_language: language.data,
    initial_message_content: input.data.message,
    requested_idempotency_key: input.data.idempotencyKey,
  });
  const conversationId = result.data?.[0]?.conversation_id;
  if (result.error || !conversationId || !documentIdSchema.safeParse(conversationId).success) {
    return { status: "error", message: t("unavailable") };
  }
  revalidateDocumentChatPaths(documentId, conversationId);
  return { status: "success", message: t("started"), conversationId };
}

/** Sends only a bounded message and idempotency key; the RPC derives all trusted fields. */
export async function sendDocumentChatMessageAction(
  locale: AppLocale,
  documentId: string,
  conversationId: string,
  _state: DocumentChatActionState,
  formData: FormData,
): Promise<DocumentChatActionState> {
  void _state;
  const t = await getTranslations({ locale, namespace: "chat" });
  const input = documentChatMessageInputSchema.safeParse({
    message: formData.get("message"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (
    !documentIdSchema.safeParse(documentId).success ||
    !documentIdSchema.safeParse(conversationId).success ||
    !input.success
  ) {
    return { status: "error", message: t("sendUnavailable") };
  }
  const context = await getDocumentContext();
  if (!context?.canProcess) return { status: "error", message: t("accessDenied") };
  const supabase = await createServerActionSupabaseClient();
  const result = await supabase.rpc("send_document_chat_message", {
    target_document_id: documentId,
    target_conversation_id: conversationId,
    requested_message_content: input.data.message,
    requested_idempotency_key: input.data.idempotencyKey,
  });
  if (result.error || !result.data?.[0]?.assistant_message_id) {
    return { status: "error", message: t("sendUnavailable") };
  }
  revalidateDocumentChatPaths(documentId, conversationId);
  return { status: "success", message: t("messageQueued") };
}

/** Retries the same failed assistant placeholder; it never creates another user message. */
export async function retryDocumentChatResponseAction(
  locale: AppLocale,
  documentId: string,
  conversationId: string,
  messageId: string,
  _state: DocumentChatActionState,
  _formData: FormData,
): Promise<DocumentChatActionState> {
  void _state;
  void _formData;
  const t = await getTranslations({ locale, namespace: "chat" });
  if (
    !documentIdSchema.safeParse(documentId).success ||
    !documentIdSchema.safeParse(conversationId).success ||
    !documentIdSchema.safeParse(messageId).success
  ) {
    return { status: "error", message: t("retryUnavailable") };
  }
  const context = await getDocumentContext();
  if (!context?.canProcess) return { status: "error", message: t("accessDenied") };
  const supabase = await createServerActionSupabaseClient();
  const result = await supabase.rpc("retry_document_chat_response", {
    target_document_id: documentId,
    target_conversation_id: conversationId,
    target_message_id: messageId,
  });
  if (result.error || result.data !== true) return { status: "error", message: t("retryUnavailable") };
  revalidateDocumentChatPaths(documentId, conversationId);
  return { status: "success", message: t("messageQueued") };
}
