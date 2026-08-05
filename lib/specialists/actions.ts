"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import {
  assignSpecialistSchema,
  createSpecialistMessageSchema,
  revokeSpecialistSchema,
  specialistIdempotencyKeySchema,
  specialistRequestIdSchema,
} from "@/lib/validation/specialists";
import type { SpecialistActionState } from "./action-state";

function formValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

type SafeRpcError = { code?: string } | null;

function isStaleError(error: SafeRpcError): boolean {
  return error?.code === "40001";
}

function isDuplicateError(error: SafeRpcError): boolean {
  return error?.code === "23505";
}

function isLifecycleError(error: SafeRpcError): boolean {
  return error?.code === "55000";
}

function isLimitError(error: SafeRpcError): boolean {
  return error?.code === "54000";
}

/** Assignment changes are visible to administrators, the household, and the specialist. */
function revalidateAssignment(locale: AppLocale, requestId: string) {
  revalidatePath(`/${locale}/admin/support-requests`);
  revalidatePath(`/${locale}/admin/support-requests/${requestId}`);
  revalidatePath(`/${locale}/admin/specialists`);
  revalidatePath(`/${locale}/support`);
  revalidatePath(`/${locale}/support/${requestId}`);
  revalidatePath(`/${locale}/specialist/support-requests`);
  revalidatePath(`/${locale}/specialist/support-requests/${requestId}`);
}

export async function assignSpecialistToSupportRequestAction(
  locale: AppLocale,
  requestId: string,
  _state: SpecialistActionState,
  formData: FormData,
): Promise<SpecialistActionState> {
  const t = await getTranslations({ locale, namespace: "specialists" });
  const id = specialistRequestIdSchema.safeParse(requestId);
  const result = assignSpecialistSchema.safeParse({
    specialistId: formValue(formData, "specialistId"),
    expectedAssignmentVersion: formValue(formData, "expectedAssignmentVersion"),
  });
  if (!id.success || !result.success) return { status: "error", message: t("validationError") };

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("assign_specialist_to_support_request", {
    target_thread_id: id.data,
    target_specialist_id: result.data.specialistId,
    expected_assignment_version: result.data.expectedAssignmentVersion,
  });
  if (error) {
    if (isStaleError(error)) return { status: "error", message: t("staleError") };
    if (isDuplicateError(error)) return { status: "error", message: t("alreadyAssignedError") };
    if (isLifecycleError(error)) return { status: "error", message: t("closedAssignmentError") };
    return { status: "error", message: t("assignError") };
  }

  revalidateAssignment(locale, id.data);
  return { status: "success", message: t("assignmentCreated") };
}

export async function revokeSpecialistFromSupportRequestAction(
  locale: AppLocale,
  requestId: string,
  _state: SpecialistActionState,
  formData: FormData,
): Promise<SpecialistActionState> {
  const t = await getTranslations({ locale, namespace: "specialists" });
  const id = specialistRequestIdSchema.safeParse(requestId);
  const result = revokeSpecialistSchema.safeParse({
    expectedAssignmentVersion: formValue(formData, "expectedAssignmentVersion"),
  });
  if (!id.success || !result.success) return { status: "error", message: t("validationError") };

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("revoke_specialist_from_support_request", {
    target_thread_id: id.data,
    expected_assignment_version: result.data.expectedAssignmentVersion,
  });
  if (error) {
    if (isStaleError(error)) return { status: "error", message: t("staleError") };
    if (isLifecycleError(error)) return { status: "error", message: t("notAssignedError") };
    return { status: "error", message: t("revokeError") };
  }

  revalidateAssignment(locale, id.data);
  return { status: "success", message: t("assignmentRevoked") };
}

export async function addSpecialistSupportMessageAction(
  locale: AppLocale,
  requestId: string,
  _state: SpecialistActionState,
  formData: FormData,
): Promise<SpecialistActionState> {
  const t = await getTranslations({ locale, namespace: "specialists" });
  const id = specialistRequestIdSchema.safeParse(requestId);
  const result = createSpecialistMessageSchema(t("responseError")).safeParse({
    body: formValue(formData, "body"),
  });
  const idempotencyKey = specialistIdempotencyKeySchema.safeParse(formValue(formData, "idempotencyKey"));
  if (!id.success || !result.success || !idempotencyKey.success) {
    return { status: "error", message: t("validationError") };
  }

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("add_specialist_support_message", {
    target_thread_id: id.data,
    input_body: result.data.body,
    input_idempotency_key: idempotencyKey.data,
  });
  if (error) {
    if (isLimitError(error)) return { status: "error", message: t("maxMessagesError") };
    if (isLifecycleError(error)) return { status: "error", message: t("closedResponseError") };
    return { status: "error", message: t("responseCreateError") };
  }

  revalidatePath(`/${locale}/support/${id.data}`);
  revalidatePath(`/${locale}/specialist/support-requests`);
  revalidatePath(`/${locale}/specialist/support-requests/${id.data}`);
  revalidatePath(`/${locale}/admin/support-requests/${id.data}`);
  return { status: "success", message: t("responseAdded") };
}
