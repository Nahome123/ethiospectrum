"use server";

import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import {
  activityStatusSchema,
  appointmentKindSchema,
  appointmentSlotSchema,
  appointmentSlotsSchema,
  expectedVersionSchema,
  notesSchema,
  optionalNotesSchema,
  outcomeSchema,
  overrideStatusSchema,
  reasonSchema,
  toDatabaseSlot,
  uuidSchema,
} from "@/lib/validation/services";
import { serviceErrorKey, type ServiceActionState } from "./action-state";
import { revalidateServiceRequest } from "./revalidate";

/**
 * Administrator and assigned-specialist workflow actions. Each validates its
 * input shape and calls one security-definer function that derives the actor,
 * re-checks the role and request state, and records the event.
 */

type Client = Awaited<ReturnType<typeof createServerActionSupabaseClient>>;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function respond(
  locale: AppLocale,
  requestId: string,
  successKey: string,
  run: (supabase: Client) => PromiseLike<{ error: { code?: string } | null }>,
): Promise<ServiceActionState> {
  const supabase = await createServerActionSupabaseClient();
  const { error } = await run(supabase);
  if (error) {
    const t = await getTranslations({ locale, namespace: "services.errors" });
    return { status: "error", message: t(serviceErrorKey(error.code)) };
  }
  revalidateServiceRequest(locale, requestId);
  const t = await getTranslations({ locale, namespace: "services.success" });
  return { status: "success", message: t(successKey) };
}

async function invalid(locale: AppLocale): Promise<ServiceActionState> {
  const t = await getTranslations({ locale, namespace: "services.errors" });
  return { status: "error", message: t("validation") };
}

/** Slots arrive as repeated `slot.N.field` form entries. */
function readSlots(formData: FormData) {
  const count = Math.min(Number(field(formData, "slotCount")) || 1, 3);
  const slots = [];
  for (let index = 0; index < count; index += 1) {
    const localStart = field(formData, `slot.${index}.localStart`);
    if (!localStart) continue;
    slots.push({
      localStart,
      timezone: field(formData, "timezone"),
      locationType: field(formData, "locationType"),
      locationDetails: field(formData, "locationDetails"),
      meetingUrl: field(formData, "meetingUrl"),
      instructions: field(formData, "instructions"),
    });
  }
  return slots;
}

export async function assignSpecialistAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const specialistId = uuidSchema.safeParse(field(formData, "specialistId"));
  const version = expectedVersionSchema.safeParse(field(formData, "expectedVersion"));
  if (!uuidSchema.safeParse(requestId).success || !specialistId.success || !version.success)
    return invalid(locale);
  return respond(locale, requestId, "specialistAssigned", (supabase) =>
    supabase.rpc("admin_assign_service_specialist", {
      target_request_id: requestId,
      target_specialist_id: specialistId.data,
      expected_version: version.data,
    }),
  );
}

export async function requestAvailabilityAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const version = expectedVersionSchema.safeParse(field(formData, "expectedVersion"));
  if (!uuidSchema.safeParse(requestId).success || !version.success) return invalid(locale);
  return respond(locale, requestId, "availabilityRequested", (supabase) =>
    supabase.rpc("admin_request_specialist_availability", {
      target_request_id: requestId,
      expected_version: version.data,
    }),
  );
}

export async function proposeAppointmentsAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const kind = appointmentKindSchema.safeParse(field(formData, "kind"));
  const version = expectedVersionSchema.safeParse(field(formData, "expectedVersion"));
  const slots = appointmentSlotsSchema.safeParse(readSlots(formData));
  if (!uuidSchema.safeParse(requestId).success || !kind.success || !version.success || !slots.success) {
    return invalid(locale);
  }
  return respond(locale, requestId, "timesProposed", (supabase) =>
    supabase.rpc("propose_service_appointments", {
      target_request_id: requestId,
      input_kind: kind.data,
      input_slots: slots.data.map(toDatabaseSlot),
      expected_version: version.data,
    }),
  );
}

export async function scheduleAppointmentAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const kind = appointmentKindSchema.safeParse(field(formData, "kind"));
  const version = expectedVersionSchema.safeParse(field(formData, "expectedVersion"));
  const slot = appointmentSlotSchema.safeParse(readSlots(formData)[0]);
  if (!uuidSchema.safeParse(requestId).success || !kind.success || !version.success || !slot.success) {
    return invalid(locale);
  }
  return respond(locale, requestId, "appointmentScheduled", (supabase) =>
    supabase.rpc("admin_schedule_service_appointment", {
      target_request_id: requestId,
      input_kind: kind.data,
      input_slot: toDatabaseSlot(slot.data),
      expected_version: version.data,
    }),
  );
}

export async function modifyAppointmentAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const appointmentId = uuidSchema.safeParse(field(formData, "appointmentId"));
  const slot = appointmentSlotSchema.safeParse(readSlots(formData)[0]);
  if (!appointmentId.success || !slot.success) return invalid(locale);
  return respond(locale, requestId, "appointmentModified", (supabase) =>
    supabase.rpc("admin_modify_service_appointment", {
      target_appointment_id: appointmentId.data,
      input_slot: toDatabaseSlot(slot.data),
    }),
  );
}

export async function cancelAppointmentAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const appointmentId = uuidSchema.safeParse(field(formData, "appointmentId"));
  const reason = reasonSchema.safeParse(field(formData, "reason"));
  if (!appointmentId.success || !reason.success) return invalid(locale);
  return respond(locale, requestId, "appointmentCancelled", (supabase) =>
    supabase.rpc("admin_cancel_service_appointment", {
      target_appointment_id: appointmentId.data,
      input_reason: reason.data,
    }),
  );
}

export async function adminCancelRequestAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const reason = reasonSchema.safeParse(field(formData, "reason"));
  if (!uuidSchema.safeParse(requestId).success || !reason.success) return invalid(locale);
  return respond(locale, requestId, "requestCancelled", (supabase) =>
    supabase.rpc("admin_cancel_service_request", {
      target_request_id: requestId,
      input_reason: reason.data,
      input_full_refund: field(formData, "fullRefund") === "on",
    }),
  );
}

export async function declineRequestAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const reason = reasonSchema.safeParse(field(formData, "reason"));
  const version = expectedVersionSchema.safeParse(field(formData, "expectedVersion"));
  if (!uuidSchema.safeParse(requestId).success || !reason.success || !version.success) return invalid(locale);
  return respond(locale, requestId, "requestDeclined", (supabase) =>
    supabase.rpc("admin_decline_service_request", {
      target_request_id: requestId,
      input_reason: reason.data,
      expected_version: version.data,
    }),
  );
}

export async function overrideStatusAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const status = overrideStatusSchema.safeParse(field(formData, "status"));
  const reason = reasonSchema.safeParse(field(formData, "reason"));
  if (!uuidSchema.safeParse(requestId).success || !status.success || !reason.success) return invalid(locale);
  return respond(locale, requestId, "statusUpdated", (supabase) =>
    supabase.rpc("admin_override_service_status", {
      target_request_id: requestId,
      input_status: status.data,
      input_reason: reason.data,
    }),
  );
}

export async function recordOutcomeAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const appointmentId = uuidSchema.safeParse(field(formData, "appointmentId"));
  const outcome = outcomeSchema.safeParse(field(formData, "outcome"));
  const notes = optionalNotesSchema.safeParse(field(formData, "notes"));
  if (!appointmentId.success || !outcome.success || !notes.success) return invalid(locale);
  return respond(
    locale,
    requestId,
    outcome.data === "completed" ? "sessionRecorded" : "noShowRecorded",
    (supabase) =>
      supabase.rpc("record_service_appointment_outcome", {
        target_appointment_id: appointmentId.data,
        input_outcome: outcome.data,
        input_notes: notes.data ?? undefined,
      }),
  );
}

export async function updateActivityAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const activityId = uuidSchema.safeParse(field(formData, "activityId"));
  const status = activityStatusSchema.safeParse(field(formData, "status"));
  const notes = optionalNotesSchema.safeParse(field(formData, "notes"));
  if (!activityId.success || !status.success || !notes.success) return invalid(locale);
  return respond(locale, requestId, "activityUpdated", (supabase) =>
    supabase.rpc("update_service_activity", {
      target_activity_id: activityId.data,
      input_status: status.data,
      input_notes: notes.data ?? undefined,
    }),
  );
}

export async function completeServiceAction(
  locale: AppLocale,
  requestId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const notes = notesSchema.safeParse(field(formData, "notes"));
  const version = expectedVersionSchema.safeParse(field(formData, "expectedVersion"));
  if (!uuidSchema.safeParse(requestId).success || !notes.success || !version.success) return invalid(locale);
  return respond(locale, requestId, "serviceCompleted", (supabase) =>
    supabase.rpc("complete_service_request", {
      target_request_id: requestId,
      input_notes: notes.data,
      input_waive_follow_up: field(formData, "waiveFollowUp") === "on",
      expected_version: version.data,
    }),
  );
}
