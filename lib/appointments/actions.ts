"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { APPOINTMENT_CONSENT_COPY_VERSION } from "./constants";
import {
  appointmentExpectedVersionSchema,
  appointmentIdSchema,
  appointmentIdempotencyKeySchema,
  appointmentRequestIdSchema,
  createAppointmentConsentSchema,
  createAppointmentProposalSchema,
} from "@/lib/validation/appointments";
import type { AppointmentActionState } from "./action-state";

function formValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

type SafeRpcError = { code?: string } | null;

const errorKeyByCode: Record<string, string> = {
  "40001": "staleError",
  "23505": "activeAppointmentError",
  "23P01": "conflictError",
  "22007": "nonexistentTimeError",
  "22008": "ambiguousTimeError",
  "55000": "lifecycleError",
};

function mapRpcError(error: SafeRpcError, fallbackKey: string): string {
  const code = error?.code ?? "";
  return errorKeyByCode[code] ?? fallbackKey;
}

/** Appointment changes surface to the household, the specialist, and triage. */
function revalidateAppointment(locale: AppLocale, requestId: string) {
  revalidatePath(`/${locale}/support`);
  revalidatePath(`/${locale}/support/${requestId}`);
  revalidatePath(`/${locale}/specialist/support-requests`);
  revalidatePath(`/${locale}/specialist/support-requests/${requestId}`);
  revalidatePath(`/${locale}/admin/support-requests`);
  revalidatePath(`/${locale}/admin/support-requests/${requestId}`);
}

export async function proposeSupportAppointmentAction(
  locale: AppLocale,
  requestId: string,
  _state: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const t = await getTranslations({ locale, namespace: "appointments" });
  const id = appointmentRequestIdSchema.safeParse(requestId);
  const result = createAppointmentProposalSchema({
    date: t("dateError"),
    time: t("timeError"),
    timezone: t("timezoneError"),
    duration: t("durationError"),
    modality: t("modalityError"),
    meetingUrl: t("meetingUrlError"),
  }).safeParse({
    localDate: formValue(formData, "localDate"),
    localTime: formValue(formData, "localTime"),
    timezone: formValue(formData, "timezone"),
    durationMinutes: formValue(formData, "durationMinutes"),
    modality: formValue(formData, "modality"),
    meetingUrl: formValue(formData, "meetingUrl"),
  });
  const idempotencyKey = appointmentIdempotencyKeySchema.safeParse(formValue(formData, "idempotencyKey"));
  if (!id.success || !result.success || !idempotencyKey.success) {
    return { status: "error", message: t("validationError") };
  }

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("propose_support_appointment", {
    target_thread_id: id.data,
    input_local_datetime: `${result.data.localDate}T${result.data.localTime}:00`,
    input_timezone: result.data.timezone,
    input_duration_minutes: result.data.durationMinutes,
    input_modality: result.data.modality,
    // The database normalizes an empty string to null for phone appointments.
    input_meeting_url: result.data.meetingUrl ?? "",
    input_idempotency_key: idempotencyKey.data,
    input_supersedes_appointment_id: formValue(formData, "supersedesAppointmentId") || undefined,
  });
  if (error) return { status: "error", message: t(mapRpcError(error, "proposeError")) };

  revalidateAppointment(locale, id.data);
  return { status: "success", message: t("proposalCreated") };
}

export async function acceptSupportAppointmentAction(
  locale: AppLocale,
  requestId: string,
  appointmentId: string,
  _state: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const t = await getTranslations({ locale, namespace: "appointments" });
  const request = appointmentRequestIdSchema.safeParse(requestId);
  const id = appointmentIdSchema.safeParse(appointmentId);
  const expected = appointmentExpectedVersionSchema.safeParse(formValue(formData, "expectedVersion"));
  const consent = createAppointmentConsentSchema(t("consentError")).safeParse({
    acknowledged: formValue(formData, "acknowledged"),
  });
  if (!request.success || !id.success || !expected.success || !consent.success) {
    return { status: "error", message: t("validationError") };
  }

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("accept_support_appointment", {
    target_appointment_id: id.data,
    expected_version: expected.data,
    // The copy version is a server constant; a browser value is never trusted.
    input_consent_copy_version: APPOINTMENT_CONSENT_COPY_VERSION,
    input_acknowledged: true,
  });
  if (error) return { status: "error", message: t(mapRpcError(error, "acceptError")) };

  revalidateAppointment(locale, request.data);
  return { status: "success", message: t("appointmentScheduled") };
}

export async function declineSupportAppointmentAction(
  locale: AppLocale,
  requestId: string,
  appointmentId: string,
  _state: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const t = await getTranslations({ locale, namespace: "appointments" });
  const request = appointmentRequestIdSchema.safeParse(requestId);
  const id = appointmentIdSchema.safeParse(appointmentId);
  const expected = appointmentExpectedVersionSchema.safeParse(formValue(formData, "expectedVersion"));
  if (!request.success || !id.success || !expected.success) {
    return { status: "error", message: t("validationError") };
  }

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("decline_support_appointment", {
    target_appointment_id: id.data,
    expected_version: expected.data,
  });
  if (error) return { status: "error", message: t(mapRpcError(error, "declineError")) };

  revalidateAppointment(locale, request.data);
  return { status: "success", message: t("appointmentDeclined") };
}

export async function cancelSupportAppointmentAction(
  locale: AppLocale,
  requestId: string,
  appointmentId: string,
  _state: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const t = await getTranslations({ locale, namespace: "appointments" });
  const request = appointmentRequestIdSchema.safeParse(requestId);
  const id = appointmentIdSchema.safeParse(appointmentId);
  const expected = appointmentExpectedVersionSchema.safeParse(formValue(formData, "expectedVersion"));
  if (!request.success || !id.success || !expected.success) {
    return { status: "error", message: t("validationError") };
  }
  const rescheduleRequested = formValue(formData, "rescheduleRequested") === "true";

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("cancel_support_appointment", {
    target_appointment_id: id.data,
    expected_version: expected.data,
    input_reschedule_requested: rescheduleRequested,
  });
  if (error) return { status: "error", message: t(mapRpcError(error, "cancelError")) };

  revalidateAppointment(locale, request.data);
  return {
    status: "success",
    message: rescheduleRequested ? t("rescheduleRequested") : t("appointmentCancelled"),
  };
}

export async function completeSupportAppointmentAction(
  locale: AppLocale,
  requestId: string,
  appointmentId: string,
  _state: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const t = await getTranslations({ locale, namespace: "appointments" });
  const request = appointmentRequestIdSchema.safeParse(requestId);
  const id = appointmentIdSchema.safeParse(appointmentId);
  const expected = appointmentExpectedVersionSchema.safeParse(formValue(formData, "expectedVersion"));
  if (!request.success || !id.success || !expected.success) {
    return { status: "error", message: t("validationError") };
  }

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("complete_support_appointment", {
    target_appointment_id: id.data,
    expected_version: expected.data,
  });
  if (error) return { status: "error", message: t(mapRpcError(error, "completeError")) };

  revalidateAppointment(locale, request.data);
  return { status: "success", message: t("appointmentCompleted") };
}
