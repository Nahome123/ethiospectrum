"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { createSlotBookingSchema, uuidSchema } from "@/lib/validation/services";
import { serviceErrorKey, initialServiceActionState, type ServiceActionState } from "./action-state";
import {
  listOpenSlots,
  selfScheduledServiceTypes,
  type OpenSlot,
  type SelfScheduledServiceType,
} from "./booking";
import { startServicePaymentAction } from "./payment-actions";
import { revalidateServiceRequest } from "./revalidate";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** The next free Parent Support times for the public home page (times only). */
export async function loadPublicParentSupportSlotsAction(): Promise<
  { specialistId: string; startAt: string }[]
> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("list_public_parent_support_slots");
    if (error || !data) return [];
    return data.map((row) => ({ specialistId: row.specialist_id, startAt: row.start_at }));
  } catch {
    return [];
  }
}

/** Open times for the chosen specialist ("any" for everyone) and language. */
export async function loadOpenSlotsAction(
  serviceType: string,
  language: string,
  specialistId: string,
): Promise<OpenSlot[]> {
  if (!(selfScheduledServiceTypes as readonly string[]).includes(serviceType)) return [];
  if (!["en", "am", "es"].includes(language)) return [];
  const specialist = uuidSchema.safeParse(specialistId);
  return listOpenSlots(
    serviceType as SelfScheduledServiceType,
    language,
    specialist.success ? specialist.data : null,
  );
}

/**
 * Books the open time the family picked. A paid service then goes straight to
 * Stripe Checkout while the time is held; a free one is confirmed at once.
 */
export async function bookServiceSlotAction(
  locale: AppLocale,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const t = await getTranslations({ locale, namespace: "services.form" });
  const errors = await getTranslations({ locale, namespace: "services.errors" });
  const parsed = createSlotBookingSchema({
    description: t("descriptionError"),
    dependent: t("dependentError"),
  }).safeParse({
    serviceType: field(formData, "serviceType"),
    dependentId: field(formData, "dependentId"),
    description: field(formData, "description"),
    relevantInformation: field(formData, "relevantInformation"),
    category: field(formData, "category"),
    topicKey: field(formData, "topicKey"),
    language: field(formData, "language"),
    specialistId: field(formData, "specialistId"),
    startAt: field(formData, "startAt"),
    timezone: field(formData, "timezone"),
  });
  const idempotencyKey = uuidSchema.safeParse(field(formData, "idempotencyKey"));
  if (!parsed.success || !idempotencyKey.success) {
    const missingTime = !field(formData, "startAt") || !field(formData, "specialistId");
    return { status: "error", message: missingTime ? errors("chooseTime") : errors("validation") };
  }
  const booking = parsed.data;

  const supabase = await createServerActionSupabaseClient();
  const { data: requestId, error } = await supabase.rpc("book_service_slot", {
    input_service_type: booking.serviceType,
    input_dependent_id: booking.dependentId,
    input_description: booking.description,
    input_language: booking.language,
    input_specialist_id: booking.specialistId,
    input_start_at: booking.startAt,
    input_timezone: booking.timezone,
    input_idempotency_key: idempotencyKey.data,
    input_relevant_information: booking.relevantInformation ?? undefined,
    input_consultation_category: booking.category ?? undefined,
    input_consultation_topic_key: booking.topicKey ?? undefined,
  });
  if (error || !requestId) {
    const key = error?.code === "ES409" ? "slotTaken" : serviceErrorKey(error?.code);
    return { status: "error", message: errors(key) };
  }
  revalidateServiceRequest(locale, requestId);

  const { data: request } = await supabase
    .from("service_requests")
    .select("payment_status")
    .eq("id", requestId)
    .maybeSingle();
  if (request?.payment_status === "not_required") {
    redirect(`/${locale}/requests/${requestId}?booked=1`);
  }
  // Paid: open Checkout now; if it cannot start (for example fees to accept),
  // the request page offers payment with the held time shown.
  const payment = await startServicePaymentAction(
    locale,
    requestId,
    initialServiceActionState,
    new FormData(),
  );
  if (payment.status === "success" && payment.url) return payment;
  redirect(`/${locale}/requests/${requestId}?booked=1`);
}
