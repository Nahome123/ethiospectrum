"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { serviceErrorKey, type ServiceActionState } from "@/lib/services/action-state";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { calendlyLinkSchema, meetingLinkSchema, parseWeeklyHours, scheduleTimezoneSchema } from "./schedule";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Staff (specialists and Parent Support staff) set their own availability:
 * time zone, weekly hours, meeting link, whether they are taking bookings,
 * and, for Parent Support staff, their session languages and Calendly page.
 */
export async function updateMyAvailabilityAction(
  locale: AppLocale,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const errors = await getTranslations({ locale, namespace: "services.errors" });
  const timezone = scheduleTimezoneSchema.safeParse(field(formData, "timezone"));
  const meetingUrl = meetingLinkSchema.safeParse(field(formData, "meetingUrl").trim());
  const hours = parseWeeklyHours((name) => field(formData, name));
  const languages = formData
    .getAll("languages")
    .filter((value): value is string => typeof value === "string" && ["en", "am", "es"].includes(value));
  const choosesLanguages = field(formData, "choosesLanguages") === "1";
  const choosesBookingPage = field(formData, "choosesBookingPage") === "1";
  const bookingPage = calendlyLinkSchema.safeParse(field(formData, "bookingPageUrl").trim());
  if (!timezone.success || !meetingUrl.success || !hours) {
    return { status: "error", message: errors("validation") };
  }
  if (choosesLanguages && languages.length === 0) {
    return { status: "error", message: errors("chooseLanguage") };
  }
  if (choosesBookingPage && !bookingPage.success) {
    return { status: "error", message: errors("calendlyLink") };
  }
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("update_my_staff_schedule", {
    input_timezone: timezone.data,
    input_hours: hours,
    input_meeting_url: meetingUrl.data || undefined,
    input_accepting_bookings: field(formData, "accepting") === "on",
    input_parent_support_languages: choosesLanguages ? languages : undefined,
  });
  if (error) return { status: "error", message: errors(serviceErrorKey(error.code)) };
  if (choosesBookingPage && bookingPage.success) {
    const saved = await supabase.rpc("update_my_booking_page", { input_url: bookingPage.data });
    if (saved.error) return { status: "error", message: errors(serviceErrorKey(saved.error.code)) };
  }
  revalidateTag("service-catalog", "max");
  revalidatePath(`/${locale}/specialist/availability`);
  const success = await getTranslations({ locale, namespace: "services.success" });
  return { status: "success", message: success("scheduleSaved") };
}
