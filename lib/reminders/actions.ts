"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { buildReminderSchedule, ReminderScheduleError } from "@/lib/reminders/schedule";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { reminderCreateSchema, reminderIdSchema, reminderUpdateSchema } from "@/lib/validation/reminder";
import type { ReminderActionState } from "./action-state";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function revalidateReminderPaths(locale: AppLocale, itemId?: string) {
  revalidatePath(`/${locale}/reminders`);
  revalidatePath(`/${locale}/roadmap`);
  if (itemId) {
    revalidatePath(`/${locale}/roadmap/${itemId}`);
    revalidatePath(`/${locale}/roadmap/${itemId}/reminders`);
    revalidatePath(`/${locale}/roadmap/${itemId}/reminders/new`);
  }
}

function scheduleMessage(error: ReminderScheduleError, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (error.code === "ambiguous_time") return t("errors.ambiguousTime");
  if (error.code === "nonexistent_time") return t("errors.nonexistentTime");
  if (error.code === "invalid_timezone") return t("errors.invalidTimezone");
  return t("errors.pastSchedule");
}

export async function createReminderAction(
  locale: AppLocale,
  _state: ReminderActionState,
  formData: FormData,
): Promise<ReminderActionState> {
  const t = await getTranslations({ locale, namespace: "reminders" });
  const parsed = reminderCreateSchema.safeParse({
    roadmapItemId: value(formData, "roadmapItemId"),
    offsetDays: Number(value(formData, "offsetDays")),
    localTime: value(formData, "localTime"),
    timezone: value(formData, "timezone"),
    consent: value(formData, "consent"),
    consentVersion: value(formData, "consentVersion"),
    idempotencyKey: value(formData, "idempotencyKey"),
  });
  const dueDate = value(formData, "dueDate");
  if (!parsed.success || !dueDate) return { status: "error", message: t("errors.validation") };

  let schedule: ReturnType<typeof buildReminderSchedule>;
  try {
    schedule = buildReminderSchedule({
      dueDate,
      offsetDays: parsed.data.offsetDays,
      localTime: parsed.data.localTime,
      timezone: parsed.data.timezone,
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof ReminderScheduleError ? scheduleMessage(error, t) : t("errors.create"),
    };
  }
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("create_personal_reminder", {
    target_roadmap_item_id: parsed.data.roadmapItemId,
    input_offset_days: parsed.data.offsetDays,
    input_local_time: parsed.data.localTime,
    input_timezone: parsed.data.timezone,
    input_scheduled_local_date: schedule.scheduledLocalDate,
    input_scheduled_for_utc: schedule.scheduledForUtc,
    input_timezone_offset_minutes: schedule.timezoneOffsetMinutes,
    input_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    if (error.message.includes("limit")) return { status: "error", message: t("errors.limit") };
    if (error.code === "23505") return { status: "error", message: t("errors.duplicate") };
    return { status: "error", message: t("errors.create") };
  }
  revalidateReminderPaths(locale, parsed.data.roadmapItemId);
  return { status: "success", message: t("newReminder") };
}

export async function cancelReminderAction(
  locale: AppLocale,
  reminderId: string,
  _state: ReminderActionState,
  formData: FormData,
): Promise<ReminderActionState> {
  const t = await getTranslations({ locale, namespace: "reminders" });
  const parsed = reminderIdSchema.safeParse(reminderId);
  const expectedUpdatedAt = value(formData, "expectedUpdatedAt");
  if (!parsed.success || !expectedUpdatedAt) return { status: "error", message: t("errors.validation") };
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("cancel_personal_reminder", {
    target_reminder_id: parsed.data,
    expected_updated_at: expectedUpdatedAt,
  });
  if (error) return { status: "error", message: t("errors.unavailable") };
  revalidateReminderPaths(locale);
  return { status: "success", message: t("cancel") };
}

export async function updateReminderAction(
  locale: AppLocale,
  reminderId: string,
  dueDate: string,
  _state: ReminderActionState,
  formData: FormData,
): Promise<ReminderActionState> {
  const t = await getTranslations({ locale, namespace: "reminders" });
  const reminderIdResult = reminderIdSchema.safeParse(reminderId);
  const parsed = reminderUpdateSchema.safeParse({
    offsetDays: Number(value(formData, "offsetDays")),
    localTime: value(formData, "localTime"),
    timezone: value(formData, "timezone"),
    expectedScheduleVersion: value(formData, "expectedScheduleVersion"),
  });
  if (!reminderIdResult.success || !parsed.success)
    return { status: "error", message: t("errors.validation") };
  let schedule: ReturnType<typeof buildReminderSchedule>;
  try {
    schedule = buildReminderSchedule({
      dueDate,
      offsetDays: parsed.data.offsetDays,
      localTime: parsed.data.localTime,
      timezone: parsed.data.timezone,
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof ReminderScheduleError ? scheduleMessage(error, t) : t("errors.unavailable"),
    };
  }
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("update_personal_reminder", {
    target_reminder_id: reminderIdResult.data,
    expected_schedule_version: parsed.data.expectedScheduleVersion,
    input_offset_days: parsed.data.offsetDays,
    input_local_time: parsed.data.localTime,
    input_timezone: parsed.data.timezone,
    input_scheduled_local_date: schedule.scheduledLocalDate,
    input_scheduled_for_utc: schedule.scheduledForUtc,
    input_timezone_offset_minutes: schedule.timezoneOffsetMinutes,
  });
  if (error)
    return {
      status: "error",
      message:
        error.code === "40001"
          ? t("errors.unavailable")
          : error.code === "23505"
            ? t("errors.duplicate")
            : t("errors.unavailable"),
    };
  revalidateReminderPaths(locale);
  return { status: "success", message: t("save") };
}

export async function markReminderSeenAction(locale: AppLocale, reminderId: string): Promise<void> {
  if (!reminderIdSchema.safeParse(reminderId).success) return;
  const supabase = await createServerActionSupabaseClient();
  await supabase.rpc("mark_reminder_seen", { target_reminder_id: reminderId });
  revalidateReminderPaths(locale);
}
