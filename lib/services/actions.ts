"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import {
  createConsultationRequestSchema,
  createIepRequestSchema,
  messageSchema,
  optionalReasonSchema,
  requestedScheduleSchema,
  uuidSchema,
} from "@/lib/validation/services";
import { serviceErrorKey, type ServiceActionState } from "./action-state";
import { revalidateServiceRequest } from "./revalidate";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function failure(locale: AppLocale, code?: string): Promise<ServiceActionState> {
  const t = await getTranslations({ locale, namespace: "services.errors" });
  return { status: "error", message: t(serviceErrorKey(code)) };
}

/** Requested times arrive as `slot.N.localStart` entries with one shared time zone. */
function readRequestedSlots(formData: FormData) {
  const count = Math.min(Number(field(formData, "slotCount")) || 1, 3);
  const timezone = field(formData, "timezone");
  const slots = [];
  for (let index = 0; index < count; index += 1) {
    const localStart = field(formData, `slot.${index}.localStart`);
    if (localStart) slots.push({ localStart, timezone });
  }
  return slots;
}

export async function createConsultationRequestAction(
  locale: AppLocale,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const t = await getTranslations({ locale, namespace: "services.form" });
  const parsed = createConsultationRequestSchema({
    description: t("descriptionError"),
    dependent: t("dependentError"),
  }).safeParse({
    dependentId: field(formData, "dependentId"),
    description: field(formData, "description"),
    relevantInformation: field(formData, "relevantInformation"),
    category: field(formData, "category"),
    topicKey: field(formData, "topicKey"),
    preferredLanguage: field(formData, "preferredLanguage"),
  });
  const idempotencyKey = uuidSchema.safeParse(field(formData, "idempotencyKey"));
  const schedule = requestedScheduleSchema.safeParse({
    mode: field(formData, "schedulingMode"),
    slots: readRequestedSlots(formData),
  });
  if (!parsed.success || !idempotencyKey.success || !schedule.success) return failure(locale, "22023");

  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.rpc("create_service_request", {
    input_service_type: "consultation",
    input_dependent_id: parsed.data.dependentId,
    input_description: parsed.data.description,
    input_relevant_information: parsed.data.relevantInformation ?? undefined,
    input_consultation_category: parsed.data.category,
    input_consultation_topic_key: parsed.data.topicKey ?? undefined,
    input_preferred_language: parsed.data.preferredLanguage,
    input_iep_language: undefined,
    input_iep_services: undefined,
    input_delivery_method: "remote",
    input_preferred_location_type: undefined,
    input_preferred_location_details: undefined,
    input_requested_meeting_date: undefined,
    input_idempotency_key: idempotencyKey.data,
  });
  if (error || !data) return failure(locale, error?.code);
  // The request stands on its own; if the times are refused (for example a
  // daylight-saving gap), staff propose times instead and the family is told.
  const scheduled = await supabase.rpc("set_requested_schedule", {
    target_request_id: data,
    input_mode: schedule.data.mode,
    input_slots: schedule.data.slots.map((slot) => ({
      local_start: slot.localStart,
      timezone: slot.timezone,
    })),
  });
  revalidateServiceRequest(locale, data);
  redirect(`/${locale}/requests/${data}?created=1${scheduled.error ? "&scheduleError=1" : ""}`);
}

export async function createIepRequestAction(
  locale: AppLocale,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const t = await getTranslations({ locale, namespace: "services.form" });
  const parsed = createIepRequestSchema({
    description: t("descriptionError"),
    dependent: t("dependentError"),
    services: t("iepServicesError"),
    location: t("locationError"),
    meetingDate: t("meetingDateError"),
  }).safeParse({
    dependentId: field(formData, "dependentId"),
    description: field(formData, "description"),
    relevantInformation: field(formData, "relevantInformation"),
    language: field(formData, "language"),
    services: formData.getAll("services").filter((value): value is string => typeof value === "string"),
    deliveryMethod: field(formData, "deliveryMethod"),
    locationType: field(formData, "locationType"),
    locationDetails: field(formData, "locationDetails"),
    meetingDate: field(formData, "meetingDate"),
  });
  const idempotencyKey = uuidSchema.safeParse(field(formData, "idempotencyKey"));
  if (!parsed.success || !idempotencyKey.success) return failure(locale, "22023");

  const supabase = await createServerActionSupabaseClient();
  const { data, error } = await supabase.rpc("create_service_request", {
    input_service_type: "iep_language_assistance",
    input_dependent_id: parsed.data.dependentId,
    input_description: parsed.data.description,
    input_relevant_information: parsed.data.relevantInformation ?? undefined,
    input_consultation_category: undefined,
    input_consultation_topic_key: undefined,
    // Written material and sessions are delivered English <-> the selected language.
    input_preferred_language: parsed.data.language,
    input_iep_language: parsed.data.language,
    input_iep_services: parsed.data.services,
    input_delivery_method: parsed.data.deliveryMethod,
    input_preferred_location_type: parsed.data.locationType ?? undefined,
    input_preferred_location_details: parsed.data.locationDetails ?? undefined,
    input_requested_meeting_date: parsed.data.meetingDate ?? undefined,
    input_idempotency_key: idempotencyKey.data,
  });
  if (error || !data) return failure(locale, error?.code);
  revalidateServiceRequest(locale, data);
  redirect(`/${locale}/requests/${data}?created=1`);
}

async function runHouseholdRpc(
  locale: AppLocale,
  requestId: string,
  successKey: string,
  run: (supabase: Awaited<ReturnType<typeof createServerActionSupabaseClient>>) => PromiseLike<{
    error: { code?: string } | null;
  }>,
): Promise<ServiceActionState> {
  if (!uuidSchema.safeParse(requestId).success) return failure(locale, "22023");
  const supabase = await createServerActionSupabaseClient();
  const { error } = await run(supabase);
  if (error) return failure(locale, error.code);
  revalidateServiceRequest(locale, requestId);
  const t = await getTranslations({ locale, namespace: "services.success" });
  return { status: "success", message: t(successKey) };
}

export async function confirmAppointmentAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const appointmentId = uuidSchema.safeParse(field(formData, "appointmentId"));
  if (!appointmentId.success) return failure(locale, "22023");
  return runHouseholdRpc(locale, requestId, "appointmentConfirmed", (supabase) =>
    supabase.rpc("confirm_service_appointment", { target_appointment_id: appointmentId.data }),
  );
}

export async function requestOtherTimesAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const note = optionalReasonSchema.safeParse(field(formData, "note"));
  if (!note.success) return failure(locale, "22023");
  return runHouseholdRpc(locale, requestId, "otherTimesRequested", (supabase) =>
    supabase.rpc("request_other_appointment_times", {
      target_request_id: requestId,
      input_note: note.data ?? undefined,
    }),
  );
}

export async function requestRescheduleAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const reason = optionalReasonSchema.safeParse(field(formData, "reason"));
  if (!reason.success) return failure(locale, "22023");
  return runHouseholdRpc(locale, requestId, "rescheduleRequested", (supabase) =>
    supabase.rpc("request_service_reschedule", {
      target_request_id: requestId,
      input_reason: reason.data ?? undefined,
    }),
  );
}

export async function cancelServiceRequestAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const reason = optionalReasonSchema.safeParse(field(formData, "reason"));
  if (!reason.success) return failure(locale, "22023");
  return runHouseholdRpc(locale, requestId, "requestCancelled", (supabase) =>
    supabase.rpc("cancel_service_request", {
      target_request_id: requestId,
      input_reason: reason.data ?? undefined,
    }),
  );
}

export async function requestFollowUpAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const note = optionalReasonSchema.safeParse(field(formData, "note"));
  if (!note.success) return failure(locale, "22023");
  return runHouseholdRpc(locale, requestId, "followUpRequested", (supabase) =>
    supabase.rpc("request_service_follow_up", {
      target_request_id: requestId,
      input_note: note.data ?? undefined,
    }),
  );
}

/** Shared by households, assigned specialists, and administrators; the database derives the author. */
export async function addServiceMessageAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const body = messageSchema.safeParse(field(formData, "body"));
  if (!body.success) return failure(locale, "22023");
  return runHouseholdRpc(locale, requestId, "messageSent", (supabase) =>
    supabase.rpc("add_service_request_message", { target_request_id: requestId, input_body: body.data }),
  );
}
