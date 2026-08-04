"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import {
  createSupportMessageSchema,
  createSupportRequestSchema,
  supportExpectedVersionSchema,
  supportIdempotencyKeySchema,
  supportRequestIdSchema,
} from "@/lib/validation/support";
import type { SupportActionState } from "./action-state";

function formValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

type SafeRpcError = { code?: string } | null;

function isStaleError(error: SafeRpcError): boolean {
  return error?.code === "40001";
}

function isLimitError(error: SafeRpcError): boolean {
  return error?.code === "54000";
}

function isLifecycleError(error: SafeRpcError): boolean {
  return error?.code === "55000";
}

function revalidateSupport(locale: AppLocale, requestId?: string) {
  revalidatePath(`/${locale}/support`);
  revalidatePath(`/${locale}/admin/support-requests`);
  if (requestId) {
    revalidatePath(`/${locale}/support/${requestId}`);
    revalidatePath(`/${locale}/admin/support-requests/${requestId}`);
  }
}

export async function createSupportRequestAction(
  locale: AppLocale,
  _state: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const t = await getTranslations({ locale, namespace: "support" });
  const result = createSupportRequestSchema({
    subject: t("subjectError"),
    description: t("descriptionError"),
    acknowledgment: t("acknowledgmentError"),
  }).safeParse({
    subject: formValue(formData, "subject"),
    category: formValue(formData, "category"),
    preferredLanguage: formValue(formData, "preferredLanguage"),
    description: formValue(formData, "description"),
    acknowledged: formValue(formData, "acknowledged"),
  });
  const idempotencyKey = supportIdempotencyKeySchema.safeParse(formValue(formData, "idempotencyKey"));
  if (!result.success || !idempotencyKey.success) {
    return { status: "error", message: t("validationError") };
  }

  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.rpc("create_support_request", {
    input_subject: result.data.subject,
    input_category: result.data.category,
    input_preferred_language: result.data.preferredLanguage,
    input_description: result.data.description,
    input_acknowledged: true,
    input_idempotency_key: idempotencyKey.data,
  });
  const requestId = data?.[0]?.id;
  if (error || !requestId) {
    if (isLimitError(error)) return { status: "error", message: t("maxOpenError") };
    return { status: "error", message: t("createError") };
  }

  revalidateSupport(locale, requestId);
  redirect(`/${locale}/support/${requestId}`);
}

export async function addSupportRequestMessageAction(
  locale: AppLocale,
  requestId: string,
  _state: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const t = await getTranslations({ locale, namespace: "support" });
  const id = supportRequestIdSchema.safeParse(requestId);
  const result = createSupportMessageSchema(t("messageError")).safeParse({
    body: formValue(formData, "body"),
  });
  const idempotencyKey = supportIdempotencyKeySchema.safeParse(formValue(formData, "idempotencyKey"));
  if (!id.success || !result.success || !idempotencyKey.success) {
    return { status: "error", message: t("validationError") };
  }

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("add_support_request_message", {
    target_thread_id: id.data,
    input_body: result.data.body,
    input_idempotency_key: idempotencyKey.data,
  });
  if (error) {
    if (isLimitError(error)) return { status: "error", message: t("maxMessagesError") };
    if (isLifecycleError(error)) return { status: "error", message: t("closedMessageError") };
    return { status: "error", message: t("messageCreateError") };
  }

  revalidateSupport(locale, id.data);
  return { status: "success", message: t("messageAdded") };
}

export async function closeSupportRequestAction(
  locale: AppLocale,
  requestId: string,
  _state: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const t = await getTranslations({ locale, namespace: "support" });
  const id = supportRequestIdSchema.safeParse(requestId);
  const expected = supportExpectedVersionSchema.safeParse(formValue(formData, "expectedVersion"));
  if (!id.success || !expected.success) return { status: "error", message: t("validationError") };

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("close_support_request", {
    target_thread_id: id.data,
    expected_version: expected.data,
  });
  if (error) {
    if (isStaleError(error)) return { status: "error", message: t("staleError") };
    if (isLifecycleError(error)) return { status: "error", message: t("alreadyFinalError") };
    return { status: "error", message: t("closeError") };
  }

  revalidateSupport(locale, id.data);
  return { status: "success", message: t("requestClosed") };
}

export async function cancelSupportRequestAction(
  locale: AppLocale,
  requestId: string,
  _state: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const t = await getTranslations({ locale, namespace: "support" });
  const id = supportRequestIdSchema.safeParse(requestId);
  const expected = supportExpectedVersionSchema.safeParse(formValue(formData, "expectedVersion"));
  if (!id.success || !expected.success) return { status: "error", message: t("validationError") };

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("cancel_support_request", {
    target_thread_id: id.data,
    expected_version: expected.data,
  });
  if (error) {
    if (isStaleError(error)) return { status: "error", message: t("staleError") };
    if (isLifecycleError(error)) return { status: "error", message: t("alreadyFinalError") };
    return { status: "error", message: t("cancelError") };
  }

  revalidateSupport(locale, id.data);
  return { status: "success", message: t("requestCancelled") };
}
